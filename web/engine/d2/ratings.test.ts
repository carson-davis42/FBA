import { describe, expect, it } from 'vitest';
import type { RosterEntry, RostersFile } from '../shared/types';
import {
  ageAdjustment, buildRatings, clampSuggested, finishRatings, parseRatingInput, performanceScores, ratingsBlockers, setRating, startRatings,
} from './ratings';
import type { D2Result, D2State } from './state';
import { d2BaseState, d2RatedState } from './testFixtures';

const ctx = { batchId: 'b1' };
const noLuck = () => 0.5; // randInt(-2, 2) → 0
const ok = (r: D2Result) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const prev = (rows: [string, number, number][]): RostersFile => ({
  league: 'fbad2', season: 78, locked: true,
  teams: { T: rows.map(([playerId, rating, points]): RosterEntry => ({ playerId, position: 'PG', rating, age: 25, points })) },
});

describe('ageAdjustment', () => {
  it('follows the age table at every boundary', () => {
    expect([19, 22, 23, 25, 26, 29, 30, 31, 32].map(ageAdjustment)).toEqual([3, 3, 2, 2, 0, 0, -2, -2, -3]);
    expect(ageAdjustment(null)).toBe(0);
  });
});

describe('clampSuggested', () => {
  it('keeps suggestions between 40 and 99', () => {
    expect([30, 40, 77, 99, 104].map(clampSuggested)).toEqual([40, 40, 77, 99, 99]);
  });
});

describe('performanceScores', () => {
  it('buckets each player by how far their points sit from the rating trend', () => {
    const scores = performanceScores(prev([['a', 70, 100], ['b', 70, 100], ['c', 70, 100], ['d', 70, 100], ['e', 70, 300], ['z', 70, 0]]));
    expect(Object.fromEntries(scores)).toEqual({ a: -1, b: -1, c: -1, d: -1, e: 2 });
  });

  it('gives everyone 0 when points follow the trend exactly', () => {
    const scores = performanceScores(prev([['a', 60, 100], ['b', 70, 200], ['c', 80, 300]]));
    expect(Object.fromEntries(scores)).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('returns nothing without enough data', () => {
    expect(performanceScores(null).size).toBe(0);
    expect(performanceScores(prev([['a', 60, 100], ['b', 70, 200]])).size).toBe(0);
  });
});

describe('buildRatings', () => {
  it('suggests old + age + perf + luck for rated players and leaves the rest blank', () => {
    const rows = buildRatings({ ...d2BaseState(), prevD2: null }, noLuck);
    expect(rows.map(r => [r.playerId, r.team, r.oldRating, r.suggested, r.rating])).toEqual([
      ['p00020', 'AMS', 75, 73, 73], ['p00021', 'AMS', 72, 72, 72], ['p00022', 'AMS', 75, 75, 75], ['p00023', 'AMS', 94, 97, 97],
      ['p00025', 'BER', 70, 72, 72], ['p00026', 'BER', 80, 80, 80], ['p00027', 'BER', 68, 66, 66], ['p00028', 'BER', 85, 85, 85],
      ['p00040', null, null, null, null], ['p00041', null, null, null, null], ['p00042', null, null, null, null],
      ['p00043', null, null, null, null], ['p00044', null, null, null, null],
    ]);
    expect(rows[0].breakdown).toEqual({ age: -2, perf: 0, luck: 0 });
    expect(rows[8].breakdown).toBeNull();
  });

  it("uses last season's performance", () => {
    const s = { ...d2BaseState(), prevD2: prev([['p00020', 70, 300], ['x1', 70, 100], ['x2', 70, 100], ['x3', 70, 100], ['x4', 70, 100]]) };
    const row = buildRatings(s, noLuck).find(r => r.playerId === 'p00020')!;
    expect(row.breakdown).toEqual({ age: -2, perf: 2, luck: 0 });
    expect(row.suggested).toBe(75);
  });

  it('draws luck from the rng, only for rated players', () => {
    let calls = 0;
    const rows = buildRatings({ ...d2BaseState(), prevD2: null }, () => { calls++; return 0; });
    expect(calls).toBe(8);
    expect(rows[0].breakdown!.luck).toBe(-2);
  });
});

describe('startRatings', () => {
  it('creates the ratings doc once free agency is closed', () => {
    const r = ok(startRatings(d2BaseState(), noLuck));
    expect(r.changed).toEqual(['ratings']);
    expect(r.label).toBe('Start D2 ratings reset');
    expect(r.state.ratings).toMatchObject({ league: 'fbad2', season: 79, locked: false });
    expect(r.state.ratings!.players).toHaveLength(13);
  });

  it('refuses before free agency closes, or twice', () => {
    expect(startRatings({ ...d2BaseState(), freeAgencyClosed: false }, noLuck)).toEqual({ ok: false, problems: ['Close free agency first'] });
    const started = ok(startRatings(d2BaseState(), noLuck)).state;
    expect(startRatings(started, noLuck)).toEqual({ ok: false, problems: ['The ratings reset has already started'] });
  });
});

describe('parseRatingInput', () => {
  it('accepts blanks and whole numbers from 1 to 99', () => {
    expect(parseRatingInput('')).toEqual({ ok: true, value: null });
    expect(parseRatingInput(' 78 ')).toEqual({ ok: true, value: 78 });
    for (const bad of ['0', '100', '7.5', 'abc', '-3']) expect(parseRatingInput(bad)).toEqual({ ok: false, problem: 'Enter a whole number from 1 to 99' });
  });
});

describe('finishRatings', () => {
  const started = (): D2State => ok(startRatings({ ...d2BaseState(), prevD2: null }, noLuck)).state;
  const rateReserves = (s: D2State): D2State => {
    let ratings = s.ratings!;
    for (const [id, v] of [['p00040', 78], ['p00041', 74], ['p00042', 70], ['p00043', 60], ['p00044', 65]] as const) ratings = setRating(ratings, id, v);
    return { ...s, ratings };
  };

  it('is blocked while anyone is blank', () => {
    expect(ratingsBlockers(started())).toEqual(['5 players still need a rating']);
    expect(finishRatings(started(), ctx).ok).toBe(false);
  });

  it('flags players missing from, or no longer in, the list', () => {
    const s = rateReserves(started());
    const moved = { ...s, reserves: { ...s.reserves, players: s.reserves.players.filter(p => p.playerId !== 'p00043') } };
    expect(ratingsBlockers(moved)).toEqual(['Adrian Napoletani is no longer in the D2 pool']);
    const extra = { ...s, ratings: { ...s.ratings!, players: s.ratings!.players.filter(r => r.playerId !== 'p00044') } };
    expect(ratingsBlockers(extra)).toEqual(["Brycen Holcomb isn't in the ratings list"]);
  });

  it('writes the new ratings onto rosters and Reserves, locks, logs, and marks the calendar', () => {
    let s = rateReserves(started());
    s = { ...s, ratings: setRating(s.ratings!, 'p00020', 76) };
    const r = ok(finishRatings(s, ctx));
    expect(r.label).toBe('Finish D2 ratings');
    expect(r.changed).toEqual(['d2', 'reserves', 'ratings', 'd2Tx', 'calendar']);
    expect(r.state.d2.teams.AMS.map(e => e.rating)).toEqual([76, 72, 75, 97, null]);
    expect(r.state.reserves.players.map(p => p.rating)).toEqual([78, 74, 70, 60, 65]);
    expect(r.state.reserves.players[1].fromFba).toBe(true);
    expect(r.state.ratings!.locked).toBe(true);
    expect(r.state.d2Tx.entries.at(-1)).toMatchObject({ type: 'd2-ratings', teams: [], lines: ['D2 ratings reset: 13 players, 1 edited'] });
    expect(r.state.calendar.steps.find(x => x.id === 'fbad2-ratings-reset')!.done).toBe(true);
    expect(ratingsBlockers(r.state)).toEqual(['D2 ratings are already finished']);
  });
});

describe('d2RatedState fixture', () => {
  it('has the documented ratings', () => {
    const s = d2RatedState();
    expect(s.d2.teams.BER.map(e => e.rating)).toEqual([72, null, 80, 66, 85]);
    expect(s.ratings!.locked).toBe(true);
  });
});
