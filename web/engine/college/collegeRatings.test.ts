import { describe, expect, it } from 'vitest';
import { applyAllSuggestions, setRating, takeRest } from '../rank/ranking';
import { RankingFile as RankingFileSchema, type PortalPlayer, type RankingFile, type RecruitingFile, type RostersFile } from '../shared/types';
import {
  COLLEGE_RATINGS_STEP, collegeRatingRows, collegeRatingsBlockers, collegeRatingsPath, finishCollegeRatings, startCollegeRatings,
  type CollegeRatingsState,
} from './collegeRatings';
import { boardPath, collegeName } from './state';
import { collegeRatingsBaseState as baseState, collegeS78Rosters } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok, got ${(r as unknown as { problems: string[] }).problems.join('; ')}`);
  return r as Extract<T, { ok: true }>;
};
const problems = (r: { ok: boolean }) => (r.ok ? [] : (r as unknown as { problems: string[] }).problems);

const hole = (position: 'PG' | 'SG' | 'SF' | 'PF' | 'C') => ({ playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null });

const started = (s: CollegeRatingsState = baseState()): CollegeRatingsState =>
  ({ ...s, ratings: ok(startCollegeRatings(s)).writes[0].doc as RankingFile });
/** Everyone ranked in last season's order (Moss 82, Reed 69, Vega 66) and rated in order. */
const complete = (s: CollegeRatingsState): CollegeRatingsState => {
  let doc = takeRest(s.ratings!, id => collegeName(s.players, id));
  doc = setRating(setRating(setRating(doc, 'p00485', 84), 'p00488', 70), 'p00503', 65);
  return { ...s, ratings: doc };
};
const withoutRankStep = (s: CollegeRatingsState): CollegeRatingsState => ({
  ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'rank-s80-class' ? { ...x, done: false } : x)) },
});

describe('collegeRatingsPath', () => {
  it('is the season folder', () => expect(collegeRatingsPath(79)).toBe('leagues/fbajc/S79/ratings.json'));
});

describe('collegeRatingRows', () => {
  it('lists named roster players not in the class, then the uncommitted portal, and skips X players and recruits', () => {
    const rows = collegeRatingRows(baseState());
    expect(rows.map(r => [r.playerId, r.team, r.position, r.prevRating])).toEqual([
      ['p00485', 'BAY', 'PG', 82],
      ['p00503', 'DUKE', 'PF', 66],
      ['p00488', null, 'PF', 69],
    ]);
  });

  it("shows last season's points as the stat, and none for a player not on last season's rosters", () => {
    expect(collegeRatingRows(baseState()).map(r => r.stat)).toEqual(['S78: 300 pts', 'S78: 300 pts', 'S78: 300 pts']);
    expect(collegeRatingRows({ ...baseState(), prevRosters: null }).map(r => r.stat)).toEqual([null, null, null]);
    const prev: RostersFile = { ...collegeS78Rosters(), teams: { BAY: [] } };
    expect(collegeRatingRows({ ...baseState(), prevRosters: prev }).map(r => r.stat)).toEqual([null, null, null]);
  });

  it('sets no age and no other-league rating', () => {
    for (const r of collegeRatingRows(baseState())) expect([r.age, r.otherRating]).toEqual([null, null]);
  });

  it('lists a committed portal player once, at the school they committed to', () => {
    const rows = collegeRatingRows(baseState()).filter(r => r.playerId === 'p00503');
    expect(rows).toHaveLength(1);
    expect(rows[0].team).toBe('DUKE');
  });
});

describe('startCollegeRatings', () => {
  it('writes a college-reset ranking with the rows and this group\'s current ratings as the curve without a previous reset', () => {
    const s = baseState();
    const r = ok(startCollegeRatings(s));
    expect(r.writes.map(w => w.path)).toEqual(['leagues/fbajc/S79/ratings.json']);
    expect(r.label).toBe('Start college ratings reset');
    const doc = r.writes[0].doc as RankingFile;
    expect(doc).toMatchObject({ league: 'fbajc', season: 79, kind: 'college-reset', locked: false, order: [], ratings: {} });
    expect(doc.rows).toEqual(collegeRatingRows(s));
    expect(doc.curve).toEqual([82, 69, 66]);
  });

  it("uses a finished previous reset's ratings as the curve, and ignores an unfinished one", () => {
    const prev: RankingFile = { ...started().ratings!, season: 78, locked: true, ratings: {} };
    const finished = { ...prev, ratings: { p1: 70, p2: 91, p3: 88 } };
    expect((ok(startCollegeRatings({ ...baseState(), prevRatings: finished })).writes[0].doc as RankingFile).curve).toEqual([91, 88, 70]);
    const unfinished = { ...finished, locked: false };
    expect((ok(startCollegeRatings({ ...baseState(), prevRatings: unfinished })).writes[0].doc as RankingFile).curve).toEqual([82, 69, 66]);
  });

  it('writes a document the schema accepts', () => {
    expect(RankingFileSchema.safeParse(started().ratings).success).toBe(true);
  });

  it('refuses when already started or when the step is not current', () => {
    expect(problems(startCollegeRatings(started()))).toEqual(['The ratings reset has already started']);
    expect(problems(startCollegeRatings(withoutRankStep(baseState())))[0]).toMatch(/^College ratings are adjusted at the Adjust College Ratings step/);
  });
});

describe('collegeRatingsBlockers', () => {
  it('asks to start first, and says when it is finished', () => {
    expect(collegeRatingsBlockers(baseState())).toEqual(['Start the ratings reset first']);
    const s = complete(started());
    expect(collegeRatingsBlockers({ ...s, ratings: { ...s.ratings!, locked: true } })).toEqual(['College ratings are already finished']);
  });

  it('lists the ranking blockers', () => {
    expect(collegeRatingsBlockers(started())).toEqual(["3 players aren't ranked yet"]);
    expect(collegeRatingsBlockers(complete(started()))).toEqual([]);
  });

  it("names a new eligible player who isn't in the list, and one who has left the pool", () => {
    const s = complete(started());
    const players = { ...s.players, players: { ...s.players.players, p00504: { id: 'p00504', name: 'Sam New', birthSeason: null } } };
    expect(collegeRatingsBlockers({ ...s, players })).toEqual(["Sam New isn't in the ratings list"]);
    const gone = { ...s, board: { ...s.board, portal: s.board.portal.filter(p => p.playerId !== 'p00488') } };
    expect(collegeRatingsBlockers(gone)).toEqual(['Omar Reed is no longer on a college roster or in the portal']);
  });
});

describe('finishCollegeRatings', () => {
  it('writes the locked ranking, rosters, board, transactions and calendar', () => {
    const s = complete(started());
    const r = ok(finishCollegeRatings(s, ctx));
    expect(r.label).toBe('Finish college ratings');
    expect(r.writes.map(w => w.path)).toEqual([
      collegeRatingsPath(79), 'leagues/fbajc/S79/rosters.json', boardPath(78), 'leagues/fbajc/S79/transactions.json', 'calendar.json',
    ]);
    const [ratings, rosters, board, tx, cal] = r.writes.map(w => w.doc) as [RankingFile, RostersFile, RecruitingFile, typeof s.tx, typeof s.calendar];
    expect(ratings.locked).toBe(true);
    expect(rosters.teams.BAY.find(e => e.playerId === 'p00485')!.rating).toBe(84);
    expect(rosters.teams.DUKE.find(e => e.playerId === 'p00503')!.rating).toBe(65);
    expect(board.portal.map(p => [p.playerId, p.rating])).toEqual([['p00503', 65], ['p00488', 70]]);
    // The class keeps its rating (none until ranked) and X players keep theirs.
    expect(board.recruits.every(x => x.rating === null)).toBe(true);
    expect(rosters.teams.BAY.find(e => e.playerId === 'p01914')!.rating).toBeNull();
    expect(rosters.teams.BAY.find(e => e.playerId === 'p00487')!.rating).toBe(72);
    expect(tx.entries.at(-1)).toMatchObject({ type: 'college-ratings', batchId: 'b1', lines: ['College ratings reset: 3 players ranked, 0 took the suggestion'] });
    expect(cal.steps.find(x => x.id === COLLEGE_RATINGS_STEP)!.done).toBe(true);
  });

  it('counts the suggestions taken', () => {
    let s = started();
    s = { ...s, ratings: applyAllSuggestions(takeRest(s.ratings!, id => collegeName(s.players, id))) };
    const tx = ok(finishCollegeRatings(s, ctx)).writes[3].doc as typeof s.tx;
    expect(tx.entries.at(-1)!.lines).toEqual(['College ratings reset: 3 players ranked, 3 took the suggestion']);
  });

  it('refuses out of calendar order', () => {
    expect(problems(finishCollegeRatings(withoutRankStep(complete(started())), ctx))[0]).toMatch(/^College ratings are adjusted at the Adjust College Ratings step/);
  });

  it('refuses while blockers remain', () => {
    expect(problems(finishCollegeRatings(started(), ctx))).toEqual(["3 players aren't ranked yet"]);
  });

  it('gives a player who moved after the start their rating, matched by id', () => {
    const s = complete(started());
    // Moss enters the portal (a hole at BAY); Reed commits to TEX at PF.
    const teams = { ...s.rosters.teams };
    teams.BAY = teams.BAY.map(e => (e.playerId === 'p00485' ? hole('PG') : e));
    teams.TEX = teams.TEX.map(e => (e.position === 'PF' ? { playerId: 'p00488', position: 'PF' as const, rating: 69, age: null, points: 0, stars: null, classYear: 'Sr' as const } : e));
    const moss: PortalPlayer = { playerId: 'p00485', position: 'PG', classYear: 'So', rating: 82, stars: 4, projections: {}, committedTo: null, fromTeam: 'BAY' };
    const portal = [...s.board.portal.map(p => (p.playerId === 'p00488' ? { ...p, committedTo: 'TEX' } : p)), moss];
    const moved = { ...s, rosters: { ...s.rosters, teams }, board: { ...s.board, portal } };
    expect(collegeRatingsBlockers(moved)).toEqual([]);
    const [, rosters, board] = ok(finishCollegeRatings(moved, ctx)).writes.map(w => w.doc) as [RankingFile, RostersFile, RecruitingFile];
    expect(rosters.teams.TEX.find(e => e.playerId === 'p00488')!.rating).toBe(70);
    expect(rosters.teams.BAY.some(e => e.playerId === 'p00485')).toBe(false);
    expect(board.portal.find(p => p.playerId === 'p00485')!.rating).toBe(84);
    expect(board.portal.find(p => p.playerId === 'p00488')!.rating).toBe(70);
  });
});
