import { POSITIONS } from '../roster/rules';
import { appendTx, type MoveContext } from '../roster/state';
import type { ClassYear, FreeAgentsFile, MetaFile, Position, ReservesFile, RosterEntry, RostersFile, TransactionsFile } from '../shared/types';

const NEXT_YEAR: Record<'Fr' | 'So' | 'Jr', ClassYear> = { Fr: 'So', So: 'Jr', Jr: 'Sr' };

/** An empty college slot. */
export function collegeHole(position: Position): RosterEntry {
  return { playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null };
}

export interface SetupCounts { seniors: number; early: number; holes: number }

/**
 * Builds season n's college rosters from season n−1's (D19): every Senior leaves (named ones went pro, X ones just
 * leave), every player now in the pro data leaves (they left early), the rest move up a class year with points reset.
 * Empty slots stay empty. Every team keeps its five slots, one per position.
 */
export function setupCollegeRosters(input: { season: number; prev: RostersFile; proIds: Set<string> }):
  { ok: true; rosters: RostersFile; counts: SetupCounts } | { ok: false; problems: string[] } {
  const { season, prev, proIds } = input;
  if (prev.league !== 'fbajc' || prev.season !== season - 1) {
    return { ok: false, problems: [`Set up from the S${season - 1} college rosters (got S${prev.season})`] };
  }
  const problems: string[] = [];
  const counts: SetupCounts = { seniors: 0, early: 0, holes: 0 };
  const teams: Record<string, RosterEntry[]> = {};
  for (const [teamId, entries] of Object.entries(prev.teams)) {
    const positions = entries.map(e => e.position);
    if (entries.length !== POSITIONS.length || POSITIONS.some(p => !positions.includes(p))) {
      problems.push(`${teamId} doesn't have one slot per position`);
      continue;
    }
    teams[teamId] = entries.map(e => {
      if (e.playerId === null) {
        counts.holes++;
        return collegeHole(e.position);
      }
      const year = e.classYear;
      if (year === 'Sr') {
        counts.seniors++;
        counts.holes++;
        return collegeHole(e.position);
      }
      if (proIds.has(e.playerId)) {
        counts.early++;
        counts.holes++;
        return collegeHole(e.position);
      }
      if (!year) {
        problems.push(`${teamId} ${e.position} has no class year`);
        return e;
      }
      return { ...e, classYear: NEXT_YEAR[year], points: 0 };
    });
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, rosters: { league: 'fbajc', season, locked: false, teams }, counts };
}

/** "278 Seniors leave, 9 players left early, 287 holes". */
export function setupSummary(c: SetupCounts): string {
  const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [
    count(c.seniors, 'Senior leaves', 'Seniors leave'),
    count(c.early, 'player left early', 'players left early'),
    count(c.holes, 'hole', 'holes'),
  ].join(', ');
}

/** Every player id in this season's pro data: FBA and D2 rosters, FBA free agents, D2 Reserves. */
export function proPlayerIds(docs: { fba: RostersFile; freeAgents: FreeAgentsFile | null; d2: RostersFile; reserves: ReservesFile | null }): Set<string> {
  const ids = new Set<string>();
  for (const rosters of [docs.fba, docs.d2]) {
    for (const e of Object.values(rosters.teams).flat()) if (e.playerId) ids.add(e.playerId);
  }
  for (const p of docs.freeAgents?.players ?? []) ids.add(p.playerId);
  for (const p of docs.reserves?.players ?? []) ids.add(p.playerId);
  return ids;
}

export type CollegeSetupResult =
  | { ok: true; writes: { path: string; doc: unknown }[]; label: string; counts: SetupCounts }
  | { ok: false; problems: string[] };

/** The one-time setup batch: the S{n} college rosters, a new S{n} college transactions doc, and meta.rosterSeason.fbajc = n. */
export function collegeSetupDocs(input: { meta: MetaFile; prev: RostersFile; proIds: Set<string>; rostersExist: boolean }, ctx: MoveContext): CollegeSetupResult {
  const n = input.meta.currentSeason;
  if (input.rostersExist) return { ok: false, problems: [`The S${n} college rosters already exist`] };
  if (input.meta.rosterSeason.fbajc !== n - 1) {
    return { ok: false, problems: [`The college rosters are on S${input.meta.rosterSeason.fbajc}, not S${n - 1}`] };
  }
  const built = setupCollegeRosters({ season: n, prev: input.prev, proIds: input.proIds });
  if (!built.ok) return built;
  const tx: TransactionsFile = appendTx({ league: 'fbajc', season: n, entries: [] }, ctx, 'season', [], [`S${n} college rosters set up from S${n - 1}`]);
  const meta: MetaFile = { ...input.meta, rosterSeason: { ...input.meta.rosterSeason, fbajc: n } };
  return {
    ok: true,
    label: `Set up S${n} college rosters`,
    counts: built.counts,
    writes: [
      { path: `leagues/fbajc/S${n}/rosters.json`, doc: built.rosters },
      { path: `leagues/fbajc/S${n}/transactions.json`, doc: tx },
      { path: 'meta.json', doc: meta },
    ],
  };
}
