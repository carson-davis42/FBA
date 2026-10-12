import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { addExpansionTeams } from './addExpansionTeams';
import { nextSeasonDocs, type NextSeasonInput } from './nextSeason';
import { lotteryStepId, runLottery, type LotteryState } from '../offseason/lottery';
import { startDraft } from '../offseason/fbaDraft';
import {
  expansionPick, expansionPath, finishExpansion, lockProtections, pickProblems, setProtections, startExpansion, type ExpansionState,
} from '../offseason/expansion';
import { calendar, fbaDraftState, games, ids, ob, playoffs, teamsFile } from '../offseason/testFixtures';
import { fullD2State } from '../playoffs/testFixtures';
import { calendarFor } from '../shared/calendar';
import { EXPANSION_TEAMS, EXPANSION_PICKS_EACH, MAX_PROTECTED, addTeamsStepId } from '../shared/expansion';
import { schemaForPath } from '../shared/schemaRegistry';
import type {
  CalendarFile, DraftHistoryFile, ExpansionFile, LotteryFile, MetaFile, Position, RosterEntry, RostersFile, TeamsFile, TransactionsFile,
} from '../shared/types';

const ctx = { batchId: 'exp-e2e' };
const POS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** An in-memory doc map: applying a move's writes replaces the docs, as the app does after saving. */
class Docs {
  map = new Map<string, unknown>();
  written: string[] = [];
  get<T>(path: string): T { return this.map.get(path) as T; }
  set(path: string, doc: unknown) { this.map.set(path, doc); }
  apply(r: { ok: true; writes: { path: string; doc: unknown }[] } | { ok: false; problems: string[] }): void {
    if (!r.ok) throw new Error(`move refused: ${r.problems.join('; ')}`);
    for (const w of r.writes) {
      this.map.set(w.path, w.doc);
      this.written.push(w.path);
    }
  }
}

const pidOf = (team: string, pos: Position) => `p${String(20000 + ids.indexOf(team) * 5 + POS.indexOf(pos) + 1).padStart(5, '0')}`;
const players = Object.fromEntries(ids.flatMap(t => POS.map(pos => {
  const id = pidOf(t, pos);
  return [id, { id, name: `${t} ${pos}`, birthSeason: 55 }] as const;
})));
/** S79 FBA rosters: 30 teams x 5 players (one per position), $3 through S82; T00-T21 have a restricted C. */
const s79Rosters = (): RostersFile => ({
  league: 'fba', season: 79, locked: true,
  teams: Object.fromEntries(ids.map((t, ti) => [t, POS.map((position, i): RosterEntry => ({
    playerId: pidOf(t, position), position, rating: 70 + ((ti * 5 + i) % 20), age: 25, points: 10, contractEnd: 82, contractAmount: 3,
    ...(ti < 22 && position === 'C' ? { restricted: true } : {}),
  }))])),
});

const META: MetaFile = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };

describe('the S80 expansion, end to end', () => {
  it('runs the lottery, adds the teams, starts S80 with empty rosters and drafts the expansion teams', () => {
    const docs = new Docs();

    // S79: the add-teams step, then the lottery.
    const emptyTx: TransactionsFile = { league: 'fba', season: 79, entries: [] };
    docs.apply(addExpansionTeams({ season: 79, calendar: calendar(addTeamsStepId(80)), teams: teamsFile(), tx: emptyTx }, ctx));
    const teams32 = docs.get<TeamsFile>('leagues/fba/teams.json');
    expect(teams32.teams).toHaveLength(32);
    expect(docs.get<CalendarFile>('calendar.json').steps.find(s => s.id === lotteryStepId(79))!.done).toBe(false);

    const lotteryState = (): LotteryState => ({
      season: 79,
      calendar: docs.get<CalendarFile>('calendar.json'),
      teams: docs.get<TeamsFile>('leagues/fba/teams.json'),
      results: { league: 'fba', season: 79, locked: true, games: games() },
      playoffs: playoffs(),
      picks: { league: 'fba', obligations: [ob({ season: 80, originalTeam: 'T29', owner: 'T05' })] },
      tx: docs.get<TransactionsFile>('leagues/fba/S79/transactions.json'),
      lottery: null,
    });
    docs.apply(runLottery(lotteryState(), mulberry32(7), ctx));
    const lottery = docs.get<LotteryFile>('leagues/fba/S79/lottery.json');
    expect(lottery.lottery).toHaveLength(16);
    expect(lottery.order).toHaveLength(32);
    expect(new Set(lottery.order).size).toBe(32);
    expect(lottery.picks).toHaveLength(32);
    expect(lottery.lottery).toEqual(expect.arrayContaining(['PHI', 'LAL']));

    // S80 draft: the lottery's 32 picks become 32 draft picks.
    const base = fbaDraftState();
    const draft = startDraft(
      { ...base, lottery, fbaTeams: teams32, fba: { ...base.fba, teams: { ...base.fba.teams, PHI: [], LAL: [] } } },
      ctx,
    );
    if (!draft.ok) throw new Error(draft.problems.join('; '));
    const draftDoc = draft.writes.find(w => w.path === 'leagues/fba/S80/draft.json')!.doc as { picks: unknown[] };
    expect(draftDoc.picks).toHaveLength(32);

    // Go to next season: PHI and LAL get empty rosters.
    const d2 = fullD2State();
    const cal = calendarFor(79);
    const input: NextSeasonInput = {
      calendar: { ...cal, steps: cal.steps.map(s => ({ ...s, done: true })) },
      meta: META,
      d2Teams: d2.teams,
      fba: {
        rosters: s79Rosters(), freeAgents: { league: 'fba', season: 79, locked: true, players: [] },
        tx: docs.get<TransactionsFile>('leagues/fba/S79/transactions.json'),
        summary: { league: 'fba', season: 79, locked: true, host: null, champions: [] },
      },
      fbad2: {
        rosters: d2.rosters, reserves: null, tx: d2.tx, ratings: null, pool: null, draft: null,
        summary: { league: 'fbad2', season: 79, locked: true, host: null, champions: [], promotion: [] },
      },
      nextStarted: false,
      fbajc: { recruiting: null, rosters: null },
      fbaTeams: teams32,
    };
    docs.apply(nextSeasonDocs(input, ctx));
    const s80 = docs.get<RostersFile>('leagues/fba/S80/rosters.json');
    for (const t of EXPANSION_TEAMS) {
      expect(s80.teams[t.teamId].map(e => e.position)).toEqual(POS);
      expect(s80.teams[t.teamId].every(e => e.playerId === null)).toBe(true);
    }
    expect(Object.keys(s80.teams)).toHaveLength(32);

    // The expansion draft: everything before it is done.
    const cal80 = calendarFor(80);
    const at = cal80.steps.findIndex(s => s.id === 's80-expansion-draft');
    docs.set('calendar.json', { ...cal80, steps: cal80.steps.map((s, i) => ({ ...s, done: i < at })) });
    docs.set('leagues/fba/draftHistory.json', { drafts: [{ season: 79, kind: 'draft', picks: [] }] } satisfies DraftHistoryFile);
    const exp = (): ExpansionState => ({
      season: 80,
      calendar: docs.get<CalendarFile>('calendar.json'),
      teams: docs.get<TeamsFile>('leagues/fba/teams.json'),
      fba: docs.get<RostersFile>('leagues/fba/S80/rosters.json'),
      players: { nextId: 30000, players },
      expansion: docs.get<ExpansionFile | undefined>(expansionPath(80)) ?? null,
      tx: docs.get<TransactionsFile>('leagues/fba/S80/transactions.json'),
      history: docs.get<DraftHistoryFile>('leagues/fba/draftHistory.json'),
    });

    docs.apply(startExpansion(exp(), ctx));
    expect(docs.get<ExpansionFile>(expansionPath(80)).order).toHaveLength(EXPANSION_TEAMS.length * EXPANSION_PICKS_EACH);

    // Everyone protects four. T00-T21 have a restricted C, so only T22-T29 (eight teams) leave a player exposed;
    // donor d exposes the player at position d % 4, so the eight picks can fill four distinct positions twice.
    ids.forEach((t, ti) => {
      const exposed = ti >= 22 ? POS[(ti - 22) % 4] : null;
      const keep = s80.teams[t]
        .filter(e => e.restricted !== true && e.position !== exposed && e.playerId !== null)
        .slice(0, MAX_PROTECTED)
        .map(e => e.playerId!);
      docs.apply(setProtections(exp(), t, keep, ctx));
    });
    docs.apply(lockProtections(exp(), ctx));

    // Eight picks: each time the first player the clock may take.
    const order = docs.get<ExpansionFile>(expansionPath(80)).order;
    for (let k = 0; k < order.length; k++) {
      const state = exp();
      const candidate = ids
        .flatMap(t => state.fba.teams[t].map(e => e.playerId))
        .filter((id): id is string => id !== null)
        .find(id => pickProblems(state, id).length === 0);
      expect(candidate, `pick ${k + 1} for ${order[k]}`).toBeDefined();
      docs.apply(expansionPick(state, candidate!, ctx));
    }
    docs.apply(finishExpansion(exp(), ctx));

    const final = docs.get<RostersFile>('leagues/fba/S80/rosters.json');
    for (const t of EXPANSION_TEAMS) {
      const held = final.teams[t.teamId].filter(e => e.playerId !== null);
      expect(held).toHaveLength(EXPANSION_PICKS_EACH);
      expect(new Set(held.map(e => e.position)).size).toBe(EXPANSION_PICKS_EACH);
    }
    const file = docs.get<ExpansionFile>(expansionPath(80));
    expect(file.phase).toBe('done');
    const donors = file.picks.map(p => p.fromTeamId);
    expect(new Set(donors).size).toBe(8);
    for (const donor of donors) expect(final.teams[donor].filter(e => e.playerId !== null)).toHaveLength(4);
    const total = Object.values(final.teams).flat().filter(e => e.playerId !== null).length;
    expect(total).toBe(ids.length * 5);
    const history = docs.get<DraftHistoryFile>('leagues/fba/draftHistory.json');
    expect(history.drafts.map(d => `${d.season}${d.kind}`)).toEqual(['79draft', '80expansion']);

    // Every document a move wrote is schema-valid.
    for (const path of new Set(docs.written)) {
      const schema = schemaForPath(path);
      if (!schema) continue;
      const parsed = schema.safeParse(docs.get(path));
      expect(parsed.success, `${path}: ${parsed.success ? '' : parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`).toBe(true);
    }
  });
});
