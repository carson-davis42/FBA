import { describe, expect, it } from 'vitest';
import { DraftFile as DraftFileSchema, type DraftFile, type DraftProspect, type FreeAgentsFile, type PlayersFile, type ReservesFile, type RostersFile, type TransactionsFile } from '../shared/types';
import { finishRookieRatings, rookieBlockers, rookieOrder, setRookieRating, type RookieRatingsState } from './rookieRatings';

const ctx = { batchId: 'b1' };
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok, got ${(r as unknown as { problems: string[] }).problems.join('; ')}`);
  return r as Extract<T, { ok: true }>;
};
const problems = (r: { ok: boolean }) => (r.ok ? [] : (r as unknown as { problems: string[] }).problems);
const doc = <T>(r: { writes: { path: string; doc: unknown }[] }, path: string) => r.writes.find(w => w.path === path)!.doc as T;

const NAMES = ['Ann', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay'];
const ids = NAMES.map((_, i) => `p0000${i + 1}`);
const prospect = (i: number): DraftProspect => ({
  playerId: ids[i], position: (['PG', 'SG', 'SF', 'PF', 'C', 'PG'] as const)[i], college: 'c1', classYear: 'Sr', senior: true, collegeRating: 99 - i, stars: null, fbaRating: null,
});
const players: PlayersFile = { nextId: 20, players: Object.fromEntries(ids.map((id, i) => [id, { id, name: NAMES[i], birthSeason: 61 }])) };
const rookie = (i: number) => ({ playerId: ids[i], position: prospect(i).position, rating: null, age: 19, points: 0, contractEnd: 81, contractAmount: 2, restricted: true });

/** Six prospects ranked Ann..Fay. Ann and Cal went to T1, Bea to T2; Dee, Eli and Fay are undrafted. The rookie ratings step is current. */
const base = (over: Partial<RookieRatingsState> = {}): RookieRatingsState => ({
  season: 80,
  calendar: { season: 80, steps: [
    { id: 's80-fba-draft', label: 'S80 FBA Draft', kind: 'offseason', league: null, sub: false, done: true },
    { id: 's80-rate-rookies', label: 'Rate S80 Rookies', kind: 'offseason', league: null, sub: false, done: false },
    { id: 'free-agency-offseason', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  ] },
  draft: {
    league: 'fba', season: 80, locked: true, started: true, prospects: ids.map((_, i) => prospect(i)),
    picks: [
      { slot: 1, owner: 'T1', originalTeam: 'T1', playerId: ids[0] }, { slot: 2, owner: 'T2', originalTeam: 'T2', playerId: ids[1] },
      { slot: 3, owner: 'T1', originalTeam: 'T1', playerId: ids[2] },
    ],
  },
  fba: { league: 'fba', season: 80, locked: false, teams: { T1: [rookie(0), rookie(2)], T2: [rookie(1), { playerId: 'p00099', position: 'C', rating: 70, age: 25, points: 0 }] } } as RostersFile,
  freeAgents: { league: 'fba', season: 80, locked: false, players: [] },
  reserves: { league: 'fbad2', season: 80, locked: false, players: [{ playerId: 'p00098', position: 'PG', age: 30, rating: 50 }] },
  players,
  tx: { league: 'fba', season: 80, entries: [] },
  ...over,
});
const withRatings = (r: Record<string, number>, s: RookieRatingsState = base()): RookieRatingsState => ({ ...s, draft: { ...s.draft, rookieRatings: r } });

describe('rookieOrder', () => {
  it('is the prospect ranking: score order, then the commissioner\'s own order', () => {
    expect(rookieOrder(base().draft, players).map(p => p.playerId)).toEqual(ids);
    const moved: DraftFile = { ...base().draft, rankOrder: [ids[2], ids[0]] };
    expect(rookieOrder(moved, players).map(p => p.playerId)).toEqual([ids[2], ids[1], ids[0], ids[3], ids[4], ids[5]]);
  });
});

describe('setRookieRating', () => {
  const set = (s: RookieRatingsState, id: string, v: number | null) => setRookieRating(s, id, v);
  it('saves a rating from 55 to 99 in the draft document, and nothing else', () => {
    const r = ok(set(base(), ids[0], 80));
    expect(r.writes.map(w => w.path)).toEqual(['leagues/fba/S80/draft.json']);
    expect(doc<DraftFile>(r, 'leagues/fba/S80/draft.json').rookieRatings).toEqual({ [ids[0]]: 80 });
    expect(DraftFileSchema.safeParse(doc(r, 'leagues/fba/S80/draft.json')).success).toBe(true);
    ok(set(base(), ids[0], 55));
    ok(set(base(), ids[0], 99));
  });
  it('replaces a rating and clears it with null', () => {
    const r = ok(set(withRatings({ [ids[0]]: 80, [ids[1]]: 70 }), ids[0], 85));
    expect(doc<DraftFile>(r, 'leagues/fba/S80/draft.json').rookieRatings).toEqual({ [ids[0]]: 85, [ids[1]]: 70 });
    const cleared = ok(set(withRatings({ [ids[0]]: 80, [ids[1]]: 70 }), ids[0], null));
    expect(doc<DraftFile>(cleared, 'leagues/fba/S80/draft.json').rookieRatings).toEqual({ [ids[1]]: 70 });
  });
  it('refuses 54, 100 and fractions with the range, and a stranger', () => {
    for (const v of [54, 100, 70.5, Number.NaN]) expect(problems(set(base(), ids[0], v))).toEqual(['Enter a whole number from 55 to 99']);
    expect(problems(set(base(), 'p00077', 70))).toEqual(["p00077 isn't a prospect"]);
  });
  it('refuses before the draft is finished and when the step is not the current one', () => {
    const open = base();
    expect(problems(set({ ...open, draft: { ...open.draft, locked: false } }, ids[0], 70))).toEqual(['The draft is not finished']);
    const done = { ...open, calendar: { ...open.calendar, steps: open.calendar.steps.map(x => (x.id === 's80-rate-rookies' ? { ...x, done: true } : x)) } };
    expect(problems(set(done, ids[0], 70))[0]).toMatch(/^Rookies are rated at the Rate S80 Rookies step/);
  });
});

describe('rookieBlockers', () => {
  it('has none for ratings from the top down that never rise, nor with no ratings at all', () => {
    expect(rookieBlockers(withRatings({ [ids[0]]: 80, [ids[1]]: 80, [ids[2]]: 70 }))).toEqual([]);
    expect(rookieBlockers(base())).toEqual([]);
  });
  it('flags a rated player under an unrated one', () => {
    expect(rookieBlockers(withRatings({ [ids[0]]: 80, [ids[2]]: 70 }))).toEqual(['Cal is rated, but Bea, ranked above, is not']);
  });
  it('flags a rating above the one above it', () => {
    expect(rookieBlockers(withRatings({ [ids[0]]: 70, [ids[1]]: 75 }))).toEqual(["Bea's rating (75) is higher than Ann's (70)"]);
  });
});

describe('finishRookieRatings', () => {
  const finish = (s: RookieRatingsState) => finishRookieRatings(s, ctx);
  const rated = () => withRatings({ [ids[0]]: 80, [ids[1]]: 75, [ids[2]]: 70, [ids[3]]: 60 });

  it('keeps the rating of a drafted player on his team, puts a rated undrafted player in free agency, and the rest in the Reserves in rank order', () => {
    const r = ok(finish(rated()));
    expect(r.label).toBe('Finish the S80 rookie ratings');
    expect(r.writes.map(w => w.path)).toEqual([
      'leagues/fba/S80/rosters.json', 'leagues/fba/S80/freeAgents.json', 'leagues/fbad2/S80/reserves.json', 'leagues/fba/S80/transactions.json', 'calendar.json',
    ]);
    const fba = doc<RostersFile>(r, 'leagues/fba/S80/rosters.json');
    expect(fba.teams.T1.map(e => [e.playerId, e.rating])).toEqual([[ids[0], 80], [ids[2], 70]]);
    expect(fba.teams.T2.map(e => [e.playerId, e.rating])).toEqual([[ids[1], 75], ['p00099', 70]]);
    expect(doc<FreeAgentsFile>(r, 'leagues/fba/S80/freeAgents.json').players).toEqual([
      { playerId: ids[3], position: 'PF', age: 19, rating: 60, rookie: true, note: 'Undrafted' },
    ]);
    expect(doc<ReservesFile>(r, 'leagues/fbad2/S80/reserves.json').players).toEqual([
      { playerId: 'p00098', position: 'PG', age: 30, rating: 50 },
      { playerId: ids[4], position: 'C', age: 19, rating: null, fromFba: true },
      { playerId: ids[5], position: 'PG', age: 19, rating: null, fromFba: true },
    ]);
  });

  it('takes an unrated drafted player off his team and sends him to the Reserves; never to free agency', () => {
    const r = ok(finish(withRatings({ [ids[0]]: 80 })));
    const fba = doc<RostersFile>(r, 'leagues/fba/S80/rosters.json');
    expect(fba.teams.T1.map(e => e.playerId)).toEqual([ids[0]]);
    expect(fba.teams.T2.map(e => e.playerId)).toEqual(['p00099']);
    expect(doc<FreeAgentsFile>(r, 'leagues/fba/S80/freeAgents.json').players).toEqual([]);
    expect(doc<ReservesFile>(r, 'leagues/fbad2/S80/reserves.json').players.map(p => p.playerId)).toEqual(['p00098', ids[1], ids[2], ids[3], ids[4], ids[5]]);
  });

  it('with no ratings at all, everyone goes to the Reserves in rank order', () => {
    const r = ok(finish(base()));
    expect(doc<ReservesFile>(r, 'leagues/fbad2/S80/reserves.json').players.map(p => p.playerId)).toEqual(['p00098', ...ids]);
    expect(doc<FreeAgentsFile>(r, 'leagues/fba/S80/freeAgents.json').players).toEqual([]);
    expect(doc<RostersFile>(r, 'leagues/fba/S80/rosters.json').teams.T1).toEqual([]);
  });

  it('keeps the free agents already there, logs the outcome and marks the step done', () => {
    const existing = { playerId: 'p00021', position: 'C' as const, age: 21, rating: 60, rookie: false, note: '' };
    const s = { ...rated(), freeAgents: { ...rated().freeAgents, players: [existing] } };
    const r = ok(finish(s));
    expect(doc<FreeAgentsFile>(r, 'leagues/fba/S80/freeAgents.json').players[0]).toEqual(existing);
    const tx = doc<TransactionsFile>(r, 'leagues/fba/S80/transactions.json');
    expect(tx.entries.at(-1)).toMatchObject({
      type: 'drafted', lines: ['The S80 rookies are rated: 4 rated (1 to free agency), 2 to the D2 draft pool'],
    });
    const cal = doc<{ steps: { id: string; done: boolean }[] }>(r, 'calendar.json');
    expect(cal.steps.find(x => x.id === 's80-rate-rookies')!.done).toBe(true);
  });

  it('refuses with blockers, a second time, and when the step is not current; inputs are untouched', () => {
    expect(problems(finish(withRatings({ [ids[0]]: 80, [ids[2]]: 70 })))).toEqual(['Cal is rated, but Bea, ranked above, is not']);
    const s = rated();
    const before = JSON.stringify(s);
    const done = ok(finish(s));
    expect(JSON.stringify(s)).toBe(before);
    const next = { ...s, calendar: doc<RookieRatingsState['calendar']>(done, 'calendar.json') };
    expect(problems(finish(next))[0]).toMatch(/^Rookies are rated at the/);
    expect(problems(finish({ ...s, draft: { ...s.draft, locked: false } }))).toEqual(['The draft is not finished']);
  });
});
