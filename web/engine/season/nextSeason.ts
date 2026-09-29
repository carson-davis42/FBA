import { TIERS } from '../playoffs/promotion';
import { appendTx, type MoveContext } from '../roster/state';
import { calendarFor } from '../shared/calendar';
import type {
  CalendarFile, D2DraftFile, D2PoolFile, D2RatingsFile, FreeAgentsFile, MetaFile, PromotionLine, ReservesFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile,
} from '../shared/types';

export const D2_LEAGUE_SIZE = 16;

export interface TeamMove { teamId: string; from: string; to: string }

/** Moves each promoted D2 team up one tier and each relegated team down one; every league must keep 16 teams. */
export function applyPromotion(teams: TeamsFile, lines: PromotionLine[]): { ok: true; teams: TeamsFile; moves: TeamMove[] } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const groupOf = new Map(teams.teams.map(t => [t.teamId, t.group]));
  const to = new Map<string, string>();
  const moves: TeamMove[] = [];
  for (const line of lines) {
    const k = TIERS.indexOf(line.league);
    if (k < 0) {
      problems.push(`${line.league} isn't a D2 league`);
      continue;
    }
    const steps: [string[], number][] = [[line.relegated, 1], [line.promoted, -1]];
    for (const [ids, step] of steps) {
      for (const id of ids) {
        const dest = TIERS[k + step];
        if (groupOf.get(id) !== line.league) problems.push(`${id} isn't in the ${line.league}`);
        else if (!dest) problems.push(`${id} can't move out of the ${line.league}`);
        else if (to.has(id)) problems.push(`${id} moves twice`);
        else {
          to.set(id, dest);
          moves.push({ teamId: id, from: line.league, to: dest });
        }
      }
    }
  }
  const next: TeamsFile = { ...teams, teams: teams.teams.map(t => (to.has(t.teamId) ? { ...t, group: to.get(t.teamId)! } : t)) };
  if (!problems.length) {
    for (const lg of TIERS) {
      const count = next.teams.filter(t => t.group === lg).length;
      if (count !== D2_LEAGUE_SIZE) problems.push(`The ${lg} would have ${count} teams (it needs ${D2_LEAGUE_SIZE})`);
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, teams: next, moves };
}

/** Every document "Go to next season" reads or writes, for season n. */
export function nextSeasonPaths(n: number) {
  const fba = (s: number, f: string) => `leagues/fba/S${s}/${f}.json`;
  const d2 = (s: number, f: string) => `leagues/fbad2/S${s}/${f}.json`;
  return {
    meta: 'meta.json',
    calendar: 'calendar.json',
    d2Teams: 'leagues/fbad2/teams.json',
    fba: { rosters: fba(n, 'rosters'), freeAgents: fba(n, 'freeAgents'), tx: fba(n, 'transactions'), summary: fba(n, 'summary') },
    fbad2: {
      rosters: d2(n, 'rosters'), reserves: d2(n, 'reserves'), tx: d2(n, 'transactions'),
      ratings: d2(n, 'ratings'), pool: d2(n, 'pool'), draft: d2(n, 'draft'), summary: d2(n, 'summary'),
    },
    next: {
      fbaRosters: fba(n + 1, 'rosters'), fbaFreeAgents: fba(n + 1, 'freeAgents'), fbaTx: fba(n + 1, 'transactions'),
      d2Rosters: d2(n + 1, 'rosters'), d2Reserves: d2(n + 1, 'reserves'), d2Tx: d2(n + 1, 'transactions'),
    },
  };
}

export interface NextSeasonInput {
  calendar: CalendarFile;
  meta: MetaFile;
  d2Teams: TeamsFile;
  fba: { rosters: RostersFile; freeAgents: FreeAgentsFile | null; tx: TransactionsFile; summary: SummaryFile | null };
  fbad2: {
    rosters: RostersFile; reserves: ReservesFile | null; tx: TransactionsFile;
    ratings: D2RatingsFile | null; pool: D2PoolFile | null; draft: D2DraftFile | null; summary: SummaryFile | null;
  };
  /** True when S{n+1} FBA or D2 rosters already exist. */
  nextStarted: boolean;
}

export type NextSeasonResult =
  | { ok: true; writes: { path: string; doc: unknown }[]; label: string; moves: TeamMove[] }
  | { ok: false; problems: string[] };

/** "Go to next season" (spec section 5): lock S{n}, create S{n+1}, apply D2 promotion, reset the calendar, move meta on. */
export function nextSeasonDocs(input: NextSeasonInput, ctx: MoveContext): NextSeasonResult {
  const n = input.calendar.season;
  const problems: string[] = [];
  const current = input.calendar.steps.find(s => !s.done);
  if (current) problems.push(`Finish every S${n} calendar step first (current step: ${current.label})`);
  if (input.meta.currentSeason !== n) problems.push(`The calendar is for S${n} but the current season is S${input.meta.currentSeason}`);
  if (!input.fba.summary?.locked) problems.push(`Finish the S${n} FBA season first`);
  if (!input.fbad2.summary?.locked) problems.push(`Finish the S${n} D2 season first`);
  if (input.nextStarted) problems.push(`S${n + 1} has already started`);
  const promo = applyPromotion(input.d2Teams, input.fbad2.summary?.promotion ?? []);
  if (!promo.ok) problems.push(...promo.problems);
  if (problems.length || !promo.ok) return { ok: false, problems };

  const next = n + 1;
  const p = nextSeasonPaths(n);
  const writes: { path: string; doc: unknown }[] = [];
  const lock = <T extends { locked?: boolean }>(path: string, doc: T | null) => {
    if (doc && !doc.locked) writes.push({ path, doc: { ...doc, locked: true } });
  };
  lock(p.fba.rosters, input.fba.rosters);
  lock(p.fba.freeAgents, input.fba.freeAgents);
  lock(p.fba.tx, input.fba.tx);
  lock(p.fbad2.rosters, input.fbad2.rosters);
  lock(p.fbad2.reserves, input.fbad2.reserves);
  lock(p.fbad2.tx, input.fbad2.tx);
  lock(p.fbad2.ratings, input.fbad2.ratings);
  lock(p.fbad2.pool, input.fbad2.pool);
  lock(p.fbad2.draft, input.fbad2.draft);

  const carry = (r: RostersFile): RostersFile => ({
    ...r, season: next, locked: false,
    teams: Object.fromEntries(Object.entries(r.teams).map(([t, entries]) => [t, entries.map(e => ({ ...e, points: 0 }))])),
  });
  const started = (league: 'fba' | 'fbad2'): TransactionsFile =>
    appendTx({ league, season: next, entries: [] }, ctx, 'season', [], [`S${next} season started`]);
  const reserves: ReservesFile = {
    league: 'fbad2', season: next, locked: false,
    players: (input.fbad2.reserves?.players ?? []).map(({ fromFba: _fromFba, ...rest }) => rest),
  };
  writes.push(
    { path: p.next.fbaRosters, doc: carry(input.fba.rosters) },
    { path: p.next.fbaFreeAgents, doc: { league: 'fba', season: next, locked: false, players: [] } },
    { path: p.next.fbaTx, doc: started('fba') },
    { path: p.next.d2Rosters, doc: carry(input.fbad2.rosters) },
    { path: p.next.d2Reserves, doc: reserves },
    { path: p.next.d2Tx, doc: started('fbad2') },
    { path: p.d2Teams, doc: promo.teams },
    { path: p.calendar, doc: calendarFor(next) },
    {
      path: p.meta,
      doc: {
        ...input.meta,
        currentSeason: next,
        rosterSeason: { ...input.meta.rosterSeason, fba: next, fbad2: next },
        lastSeason: { ...input.meta.lastSeason, fba: n, fbad2: n },
      },
    },
  );
  return { ok: true, writes, label: `Start S${next}`, moves: promo.moves };
}
