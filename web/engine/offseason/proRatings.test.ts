import { describe, expect, it } from 'vitest';
import { applyAllSuggestions, setRating, suggestion, take, takeRest } from '../rank/ranking';
import { collegeName } from '../college/state';
import { RankingFile as RankingFileSchema, type DraftFile, type RankingFile, type RatingPauseFile, type RostersFile } from '../shared/types';
import {
  finishProRatings, proCurve, proMembershipBlockers, proRatingRows, proRatingsBlockers, proRatingsPath, PRO_RATINGS_STEP, startProRatings,
  syncProRatings, type ProRatingsState,
} from './proRatings';
import { proRatingsState as baseState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok, got ${(r as unknown as { problems: string[] }).problems.join('; ')}`);
  return r as Extract<T, { ok: true }>;
};
const problems = (r: { ok: boolean }) => (r.ok ? [] : (r as unknown as { problems: string[] }).problems);

const started = (s: ProRatingsState = baseState()): ProRatingsState => ({ ...s, ratings: ok(startProRatings(s)).writes[0].doc as RankingFile });
/** Everyone ranked (Pro A, Pro E, Sam Senior, Ron Three) and rated in order; Pro A takes the suggestion. */
const complete = (s: ProRatingsState): ProRatingsState => {
  let doc = takeRest(s.ratings!, id => collegeName(s.players, id));
  doc = setRating(setRating(setRating(setRating(doc, 'p00020', 70), 'p00024', 66), 'p00001', 60), 'p00012', 50);
  return { ...s, ratings: doc };
};
const pause = (players: { playerId: string; oldRating: number }[]): RatingPauseFile => ({
  league: 'fba', season: 79, afterGame: 322, locked: true,
  players: players.map(p => ({ ...p, teamId: 'BOS', position: 'PG' as const, games: 10, ppg: 10, perf: null, suggested: null, rating: p.oldRating })),
});
const lockedPrev = (ratings: Record<string, number>): RankingFile =>
  ({ league: 'fba', season: 79, kind: 'fba-reset', locked: true, rows: [], order: [], ratings, curve: [] });
const withoutStep = (s: ProRatingsState): ProRatingsState => ({ ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'adjust-age' ? { ...x, done: false } : x)) } });

describe('proRatingsPath', () => {
  it('is the season folder', () => expect(proRatingsPath(80)).toBe('leagues/fba/S80/ratings.json'));
});

describe('proRatingRows', () => {
  it('lists the FBA roster players with team, age, previous rating and last season\'s points, then the prospects', () => {
    expect(proRatingRows(baseState())).toEqual([
      { playerId: 'p00020', position: 'PG', age: 21, team: 'BOS', prevRating: 70, otherRating: null, stat: 'S79: 412 pts' },
      { playerId: 'p00024', position: 'SG', age: 30, team: 'BOS', prevRating: 65, otherRating: null, stat: null },
      { playerId: 'p00001', position: 'PG', age: null, team: null, prevRating: null, otherRating: 80, stat: 'Sr · ONE' },
      { playerId: 'p00012', position: 'SF', age: 18, team: null, prevRating: null, otherRating: 68, stat: 'Fr · TWO' },
    ]);
  });

  it('has no stat without last season\'s rosters, and no prospects without a draft', () => {
    const rows = proRatingRows({ ...baseState(), prevFba: null, draft: null });
    expect(rows.map(r => [r.playerId, r.stat])).toEqual([['p00020', null], ['p00024', null]]);
  });

  it('takes the previous rating from a finished reset, else the ratings pause, else the roster', () => {
    const p = pause([{ playerId: 'p00020', oldRating: 68 }]);
    const prev = lockedPrev({ p00020: 88 });
    const prevOf = (s: ProRatingsState) => proRatingRows(s).map(r => r.prevRating).slice(0, 2);
    expect(prevOf({ ...baseState(), prevRatings: prev, pause: p })).toEqual([88, 65]);
    expect(prevOf({ ...baseState(), prevRatings: { ...prev, locked: false }, pause: p })).toEqual([68, 65]);
    expect(prevOf({ ...baseState(), pause: p })).toEqual([68, 65]);
    expect(prevOf(baseState())).toEqual([70, 65]);
  });
});

describe('proCurve', () => {
  it('is a finished previous reset sorted high to low, clamped to 1-99', () => {
    expect(proCurve({ ...baseState(), prevRatings: lockedPrev({ a: 70, b: 120, c: 0, d: 88 }), pause: pause([{ playerId: 'x', oldRating: 50 }]) })).toEqual([99, 88, 70, 1]);
  });

  it('falls back to the pause old ratings, then the roster ratings', () => {
    const p = pause([{ playerId: 'p00020', oldRating: 60 }, { playerId: 'p00024', oldRating: 75 }]);
    expect(proCurve({ ...baseState(), pause: p })).toEqual([75, 60]);
    expect(proCurve({ ...baseState(), prevRatings: { ...lockedPrev({ a: 90 }), locked: false }, pause: p })).toEqual([75, 60]);
    expect(proCurve(baseState())).toEqual([70, 65]);
  });

  it('gives no suggestion beyond the curve', () => {
    const s = started();
    expect(suggestion(s.ratings!, s.ratings!.curve.length + 1)).toBeNull();
  });
});

describe('startProRatings', () => {
  it('writes an unlocked fba-reset ranking with the rows and curve', () => {
    const s = baseState();
    const r = ok(startProRatings(s));
    expect(r.label).toBe('Start the pro ratings reset');
    expect(r.writes.map(w => w.path)).toEqual(['leagues/fba/S80/ratings.json']);
    const doc = r.writes[0].doc as RankingFile;
    expect(doc).toMatchObject({ league: 'fba', season: 80, kind: 'fba-reset', locked: false, order: [], ratings: {} });
    expect(doc.rows).toEqual(proRatingRows(s));
    expect(doc.curve).toEqual([70, 65]);
    expect(RankingFileSchema.safeParse(doc).success).toBe(true);
  });

  it('refuses off the step, without a draft doc, and when already started', () => {
    expect(problems(startProRatings(withoutStep(baseState())))[0]).toMatch(/^Pro ratings are reset at the Adjust Pro Ratings\(reset\) step/);
    expect(problems(startProRatings({ ...baseState(), draft: null }))).toEqual(['Run Adjust Age first']);
    expect(problems(startProRatings(started()))).toEqual(['The pro ratings reset has already started']);
  });
});

describe('membership', () => {
  it('names a player missing from the list and one who has left the pool', () => {
    const s = started();
    expect(proMembershipBlockers(s)).toEqual([]);
    const draft: DraftFile = { ...s.draft!, prospects: s.draft!.prospects.filter(p => p.playerId !== 'p00012') };
    const fba: RostersFile = { ...s.fba, teams: { BOS: [...s.fba.teams.BOS, { playerId: 'p00021', position: 'C', rating: 60, age: 21, points: 0 }] } };
    expect(proMembershipBlockers({ ...s, draft, fba })).toEqual([
      "Pro B isn't in the ratings list",
      'Ron Three is no longer on an FBA roster or the draft board',
    ]);
  });

  it('is empty before the reset starts', () => expect(proMembershipBlockers(baseState())).toEqual([]));

  it('sync adds, removes and keeps rankings, labelled', () => {
    let s = started();
    s = { ...s, ratings: setRating(take(take(s.ratings!, 'p00012'), 'p00020'), 'p00012', 50) };
    const draft: DraftFile = { ...s.draft!, prospects: s.draft!.prospects.filter(p => p.playerId !== 'p00012') };
    const fba: RostersFile = { ...s.fba, teams: { BOS: [...s.fba.teams.BOS, { playerId: 'p00021', position: 'C', rating: 60, age: 21, points: 0 }] } };
    const r = ok(syncProRatings({ ...s, draft, fba }));
    expect(r.label).toBe('Sync the pro ratings list');
    expect(r.writes.map(w => w.path)).toEqual(['leagues/fba/S80/ratings.json']);
    const doc = r.writes[0].doc as RankingFile;
    expect(doc.rows.map(x => x.playerId).sort()).toEqual(['p00001', 'p00020', 'p00021', 'p00024']);
    expect(doc.order).toEqual(['p00020']);
    expect(doc.ratings).toEqual({});
  });

  it('sync refuses before the start and after the finish', () => {
    expect(problems(syncProRatings(baseState()))).toEqual(['Start the pro ratings reset first']);
    const s = complete(started());
    expect(problems(syncProRatings({ ...s, ratings: { ...s.ratings!, locked: true } }))).toEqual(['Pro ratings are already finished']);
  });
});

describe('proRatingsBlockers', () => {
  it('asks to start first, lists the ranking blockers, and says when finished', () => {
    expect(proRatingsBlockers(baseState())).toEqual(['Start the pro ratings reset first']);
    expect(proRatingsBlockers(started())).toEqual(["4 players aren't ranked yet"]);
    expect(proRatingsBlockers(complete(started()))).toEqual([]);
    const s = complete(started());
    expect(proRatingsBlockers({ ...s, ratings: { ...s.ratings!, locked: true } })).toEqual(['Pro ratings are already finished']);
  });

  it('includes the membership blockers', () => {
    const s = complete(started());
    expect(proRatingsBlockers({ ...s, draft: { ...s.draft!, prospects: [] } })).toEqual([
      'Sam Senior is no longer on an FBA roster or the draft board',
      'Ron Three is no longer on an FBA roster or the draft board',
    ]);
  });
});

describe('finishProRatings', () => {
  it('writes the locked ranking, ratings on rosters and prospects, the tx line and the calendar', () => {
    const s = complete(started());
    const r = ok(finishProRatings(s, ctx));
    expect(r.label).toBe('Finish the pro ratings reset');
    expect(r.writes.map(w => w.path)).toEqual([
      'leagues/fba/S80/ratings.json', 'leagues/fba/S80/rosters.json', 'leagues/fba/S80/draft.json', 'leagues/fba/S80/transactions.json', 'calendar.json',
    ]);
    const [ratings, rosters, draft, tx, cal] = r.writes.map(w => w.doc) as [RankingFile, RostersFile, DraftFile, { entries: { type: string; lines: string[]; teams: string[]; batchId: string }[] }, ProRatingsState['calendar']];
    expect(ratings.locked).toBe(true);
    expect(rosters.teams.BOS.map(e => e.rating)).toEqual([70, 66, null]);
    expect(rosters.teams.BOS[2].playerId).toBeNull();
    expect(draft.prospects.map(p => [p.playerId, p.fbaRating])).toEqual([['p00001', 60], ['p00012', 50]]);
    expect(tx.entries).toEqual([{ seq: 1, batchId: 'b1', type: 'fba-ratings', teams: [], lines: ['FBA ratings reset: 2 players and 2 prospects ranked, 1 took the suggestion'] }]);
    expect(cal.steps.find(x => x.id === PRO_RATINGS_STEP)!.done).toBe(true);
  });

  it('counts every ranked player that took the suggestion', () => {
    let s = started();
    s = { ...s, ratings: applyAllSuggestions(takeRest(s.ratings!, id => collegeName(s.players, id))) };
    const line = ((ok(finishProRatings({ ...s, ratings: { ...s.ratings!, ratings: { ...s.ratings!.ratings, p00001: 40, p00012: 30 } } }, ctx)).writes[3].doc) as { entries: { lines: string[] }[] }).entries[0].lines[0];
    expect(line).toBe('FBA ratings reset: 2 players and 2 prospects ranked, 2 took the suggestion');
  });

  it('refuses off the step and with blockers', () => {
    expect(problems(finishProRatings(withoutStep(complete(started())), ctx))[0]).toMatch(/^Pro ratings are reset at the/);
    expect(problems(finishProRatings(started(), ctx))).toEqual(["4 players aren't ranked yet"]);
    const s = complete(started());
    expect(problems(finishProRatings({ ...s, ratings: { ...s.ratings!, locked: true } }, ctx))).toEqual(['Pro ratings are already finished']);
  });
});
