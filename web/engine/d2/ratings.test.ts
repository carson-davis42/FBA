import { describe, expect, it } from 'vitest';
import { applyAllSuggestions, setRating, takeRest } from '../rank/ranking';
import { RankingFile } from '../shared/types';
import { buildRankingRows, d2Curve, finishRatings, membershipBlockers, parseRatingInput, ratingsBlockers, startRatings } from './ratings';
import { d2Name, type D2Result, type D2State } from './state';
import { d2BaseState, d2RatedState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: D2Result) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const started = (s: D2State = d2BaseState()): D2State => ok(startRatings(s)).state;
/** Everyone ranked in last season's order; the 8 with a suggestion take it; the last 5 in rank order are rated 66, 64, 62, 60, 58. */
const ranked = (s: D2State): D2State => {
  let doc = applyAllSuggestions(takeRest(s.ratings!, id => d2Name(s, id)));
  // The 4 unrated Reserves rank with the existing players, then the FBA free agent; rate the last 5 in rank order.
  doc.order.slice(-5).forEach((id, k) => { doc = setRating(doc, id, 66 - 2 * k); });
  return { ...s, ratings: doc };
};
const prevFile = (ratings: Record<string, number>, locked = true): RankingFile => ({
  league: 'fbad2', season: 78, kind: 'd2-reset', locked,
  rows: Object.keys(ratings).map(playerId => ({ playerId, position: 'PG', age: 25, team: 'AMS', prevRating: 70, otherRating: null, stat: null })),
  order: Object.keys(ratings), ratings, curve: [],
});

describe('buildRankingRows', () => {
  it("lists every pool member with the current D2 rating, last season's points and an FBA rating", () => {
    const rows = buildRankingRows(d2BaseState());
    expect(rows.map(r => [r.playerId, r.team, r.prevRating, r.otherRating, r.stat])).toEqual([
      ['p00020', 'AMS', 75, null, '300 pts'], ['p00021', 'AMS', 72, null, '300 pts'], ['p00022', 'AMS', 75, null, '300 pts'], ['p00023', 'AMS', 94, null, '700 pts'],
      ['p00025', 'BER', 70, null, '300 pts'], ['p00026', 'BER', 80, null, '300 pts'], ['p00027', 'BER', 68, null, '300 pts'], ['p00028', 'BER', 85, null, '300 pts'],
      ['p00040', null, null, null, null], ['p00041', null, null, 71, null], ['p00042', null, null, null, null],
      ['p00043', null, null, null, null], ['p00044', null, null, null, null],
    ]);
    expect(rows[0]).toMatchObject({ position: 'PG', age: 30 });
  });

  it('has no stat without last season', () => {
    expect(buildRankingRows({ ...d2BaseState(), prevD2: null }).every(r => r.stat === null)).toBe(true);
  });
});

describe('d2Curve', () => {
  it("uses last season's finished ratings, high to low", () => {
    expect(d2Curve(prevFile({ p00001: 80, p00002: 91, p00003: 77 }), [])).toEqual([91, 80, 77]);
  });

  it("falls back to these rows' current ratings when last season has no finished reset", () => {
    const rows = buildRankingRows(d2BaseState());
    expect(d2Curve(null, rows)).toEqual([94, 85, 80, 75, 75, 72, 70, 68]);
    expect(d2Curve(prevFile({ p00001: 99 }, false), rows)).toEqual([94, 85, 80, 75, 75, 72, 70, 68]);
  });
});

describe('startRatings', () => {
  it('builds an empty ranking with the curve once free agency is closed', () => {
    const r = ok(startRatings(d2BaseState()));
    expect(r.changed).toEqual(['ratings']);
    expect(r.label).toBe('Start D2 ratings reset');
    expect(r.state.ratings).toMatchObject({ league: 'fbad2', season: 79, kind: 'd2-reset', locked: false, order: [], ratings: {} });
    expect(r.state.ratings!.rows).toHaveLength(13);
    expect(r.state.ratings!.curve).toEqual([94, 85, 80, 75, 75, 72, 70, 68]);
    expect(RankingFile.safeParse(r.state.ratings).success).toBe(true);
    const withPrev = ok(startRatings({ ...d2BaseState(), prevRatings: prevFile({ p00001: 88, p00002: 90 }) }));
    expect(withPrev.state.ratings!.curve).toEqual([90, 88]);
  });

  it('refuses before free agency closes, or twice', () => {
    expect(startRatings({ ...d2BaseState(), freeAgencyClosed: false })).toEqual({ ok: false, problems: ['Close free agency first'] });
    expect(startRatings(started())).toEqual({ ok: false, problems: ['The ratings reset has already started'] });
  });
});

describe('ratingsBlockers', () => {
  it('asks for a full ranking, then a rating for everyone, then the right order', () => {
    const s = started();
    expect(ratingsBlockers(s)).toEqual(["13 players aren't ranked yet"]);
    expect(ratingsBlockers({ ...s, ratings: takeRest(s.ratings!, id => d2Name(s, id)) })).toEqual(['13 players still need a rating']);
    const r = ranked(s);
    expect(ratingsBlockers(r)).toEqual([]);
    expect(ratingsBlockers({ ...r, ratings: setRating(r.ratings!, 'p00041', 99) })).toEqual(['#13 Kyron Smart (99) is rated above #12 Myron Mason (60)']);
  });

  it('flags players missing from, or no longer in, the list', () => {
    const s = started();
    const moved = { ...s, reserves: { ...s.reserves, players: s.reserves.players.filter(p => p.playerId !== 'p00043') } };
    expect(membershipBlockers(moved)).toEqual(['Adrian Napoletani is no longer in the D2 pool']);
    const missing = { ...s, ratings: { ...s.ratings!, rows: s.ratings!.rows.filter(r => r.playerId !== 'p00044') } };
    expect(membershipBlockers(missing)).toEqual(["Brycen Holcomb isn't in the ratings list"]);
    expect(ratingsBlockers(ranked(moved))).toEqual(['Adrian Napoletani is no longer in the D2 pool']);
  });
});

describe('finishRatings', () => {
  it('is refused while blocked', () => {
    expect(finishRatings(started(), ctx)).toEqual({ ok: false, problems: ["13 players aren't ranked yet"] });
  });

  it('writes the new ratings onto rosters and Reserves, locks, logs, and marks the calendar', () => {
    const r = ok(finishRatings(ranked(started()), ctx));
    expect(r.label).toBe('Finish D2 ratings');
    expect(r.changed).toEqual(['d2', 'reserves', 'ratings', 'd2Tx', 'calendar']);
    expect(r.state.d2.teams.AMS.map(e => e.rating)).toEqual([75, 72, 75, 94, null]);
    expect(r.state.d2.teams.BER.map(e => e.rating)).toEqual([70, null, 80, 68, 85]);
    expect(r.state.reserves.players.map(p => p.rating)).toEqual([62, 58, 60, 66, 64]);
    expect(r.state.reserves.players[1]).toMatchObject({ fromFba: true, fbaRating: 71 });
    expect(r.state.ratings!.locked).toBe(true);
    expect(RankingFile.safeParse(r.state.ratings).success).toBe(true);
    expect(r.state.d2Tx.entries.at(-1)).toMatchObject({ type: 'd2-ratings', teams: [], lines: ['D2 ratings reset: 13 players ranked, 8 took the suggestion'] });
    expect(r.state.calendar.steps.find(x => x.id === 'fbad2-ratings-reset')!.done).toBe(true);
    expect(ratingsBlockers(r.state)).toEqual(['D2 ratings are already finished']);
  });
});

describe('parseRatingInput', () => {
  it('accepts blanks and whole numbers from 1 to 99', () => {
    expect(parseRatingInput('')).toEqual({ ok: true, value: null });
    expect(parseRatingInput(' 78 ')).toEqual({ ok: true, value: 78 });
    for (const bad of ['0', '100', '7.5', 'abc', '-3']) expect(parseRatingInput(bad)).toEqual({ ok: false, problem: 'Enter a whole number from 1 to 99' });
  });
});

describe('d2RatedState fixture', () => {
  it('has the documented ratings', () => {
    const s = d2RatedState();
    expect(s.d2.teams.AMS.map(e => e.rating)).toEqual([73, 72, 75, 97, null]);
    expect(s.d2.teams.BER.map(e => e.rating)).toEqual([72, null, 80, 66, 85]);
    expect(s.reserves.players.map(p => p.rating)).toEqual([78, 74, 70, 60, 65]);
    expect(s.ratings!.locked).toBe(true);
  });
});
