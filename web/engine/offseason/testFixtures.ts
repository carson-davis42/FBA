import { calendarFor } from '../shared/calendar';
import type { ClassYear, DraftFile, GameResult, PickObligation, PicksFile, PlayersFile, PlayoffsFile, Position, RankingFile, RecruitingFile, RosterEntry, RostersFile, TeamsFile, TransactionsFile } from '../shared/types';
import type { AdjustAgeState } from './adjustAge';
import type { DraftBoardState } from './draftBoard';
import type { ProRatingsState } from './proRatings';
import { lotteryStepId, type LotteryState } from './lottery';

// A 30-team fixture: team i beats every team j > i once, so the records are distinct (T00 29-0 ... T29 0-29).
export const ids = Array.from({ length: 30 }, (_, i) => `T${String(i).padStart(2, '0')}`);
export const teamsFile = (): TeamsFile => ({
  league: 'fba',
  teams: ids.map((teamId, i) => ({ teamId, name: teamId, abbr: teamId, group: i % 2 === 0 ? 'E' : 'W', logoFolder: null, badge: { bg: '#000', fg: '#fff' } })),
});
export const games = (): GameResult[] => {
  const out: GameResult[] = [];
  let n = 1;
  for (let i = 0; i < 30; i++) for (let j = i + 1; j < 30; j++) out.push({ gameNo: n++, home: ids[i], away: ids[j], homePts: 100, awayPts: 90 });
  return out;
};
export const playoffs = (champion = 'T00'): PlayoffsFile => ({
  league: 'fba', season: 79, locked: true, seeds: [], series: [], queue: [], games: [],
  outcome: { champions: [{ group: null, teamId: champion, runnerUp: 'T02', score: '4-2' }], promotion: null },
}) as PlayoffsFile;
export const ob = (over: Partial<PickObligation>): PickObligation => ({
  id: 'x', season: 80, originalTeam: 'T29', owner: 'T05', condition: { kind: 'none' }, originalCondition: { kind: 'none' },
  originSeason: 80, priority: 1, rolls: [], note: '', ...over,
});
export const calendar = (doneBefore = lotteryStepId(79)) => {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === doneBefore);
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
};
export const state = (over: Partial<LotteryState> = {}): LotteryState => ({
  season: 79,
  calendar: calendar(),
  teams: teamsFile(),
  results: { league: 'fba', season: 79, locked: true, games: games() },
  playoffs: playoffs(),
  picks: { league: 'fba', obligations: [] } as PicksFile,
  tx: { league: 'fba', season: 79, entries: [] } as TransactionsFile,
  lottery: null,
  ...over,
});
export const ctx = { batchId: 'b1' };


// ---- 7d: Adjust Age (S80) ----

const jcBadge = { bg: '#123', fg: '#fff' };
/** Two FBAJC schools: t1 (B12) and t2 (ACC). */
export const ageCollegeTeams = (): TeamsFile => ({
  league: 'fbajc',
  teams: [
    { teamId: 't1', name: 'School One', abbr: 'ONE', group: 'B12', logoFolder: null, badge: jcBadge },
    { teamId: 't2', name: 'School Two', abbr: 'TWO', group: 'ACC', logoFolder: null, badge: jcBadge },
  ],
});

/**
 * College: p00001 Sam Senior (t1 PG, Sr) · p00002 X (t1 SF, Sr) · p00003 Cal Center (t1 C, So, 74) · p00005 X (t2 PG, Fr).
 * Board: p00010 Rick One (C, committed to t1) · p00011 Ray Two (PG, committed to t2) · p00012 Ron Three (SF, uncommitted).
 * Pro: p00020 (FBA roster), p00021 (FBA free agent), p00022 (D2 roster), p00023 (Reserves), all born 58 and aged 21;
 * p00024 (FBA roster) has no birth season and is 30.
 */
export const agePlayers = (): PlayersFile => {
  const pl = (id: string, name: string | null, birthSeason: number | null = null) => ({ id, name, birthSeason });
  const list = [
    pl('p00001', 'Sam Senior'), pl('p00002', null), pl('p00003', 'Cal Center'), pl('p00005', null),
    pl('p00010', 'Rick One', 62), pl('p00011', 'Ray Two', 62), pl('p00012', 'Ron Three', 62), pl('p00013', 'Moe Four', 62),
    pl('p00020', 'Pro A', 58), pl('p00021', 'Pro B', 58), pl('p00022', 'Pro C', 58), pl('p00023', 'Pro D', 58), pl('p00024', 'Pro E', null),
  ];
  return { nextId: 25, players: Object.fromEntries(list.map(p => [p.id, p])) };
};

const jc = (playerId: string | null, position: Position, classYear: ClassYear | null, rating: number | null, stars: number | null = null): RosterEntry =>
  ({ playerId, position, rating, age: null, points: playerId ? 250 : 0, stars, classYear });
const holes = (from: Position[]) => from.map(p => jc(null, p, null, null));

export const agePrevCollege = (): RostersFile => ({
  league: 'fbajc',
  season: 79,
  locked: true,
  teams: {
    t1: [jc('p00001', 'PG', 'Sr', 80, 4), ...holes(['SG']), jc('p00002', 'SF', 'Sr', 66), ...holes(['PF']), jc('p00003', 'C', 'So', 74, 3)],
    t2: [jc('p00005', 'PG', 'Fr', 60), ...holes(['SG', 'SF', 'PF', 'C'])],
  },
});

export const ageBoard = (): RecruitingFile => ({
  league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true,
  recruits: [
    { playerId: 'p00010', position: 'C', classYear: 'Fr', rating: 70, stars: 3, projections: { t1: 2 }, committedTo: 't1' },
    { playerId: 'p00011', position: 'PG', classYear: 'Fr', rating: 75, stars: 4, projections: { t2: 1 }, committedTo: 't2' },
    { playerId: 'p00012', position: 'SF', classYear: 'Fr', rating: 68, stars: null, projections: {}, committedTo: null },
  ],
  portal: [],
});

export const ageState = (over: Partial<AdjustAgeState> = {}): AdjustAgeState => ({
  season: 80,
  calendar: calendarFor(80),
  meta: { currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 79, fbawc: 79 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 79, fbawc: 79 } },
  players: agePlayers(),
  fba: { league: 'fba', season: 80, locked: false, teams: { BOS: [
    { playerId: 'p00020', position: 'PG', rating: 70, age: 21, points: 0 },
    { playerId: 'p00024', position: 'SG', rating: 65, age: 30, points: 0 },
    { playerId: null, position: 'SF', rating: null, age: null, points: 0 },
  ] } },
  freeAgents: { league: 'fba', season: 80, locked: false, players: [{ playerId: 'p00021', position: 'C', age: 21, rating: 60, rookie: false, note: '' }] },
  d2: { league: 'fbad2', season: 80, locked: false, teams: { AMS: [{ playerId: 'p00022', position: 'PF', rating: 72, age: 21, points: 0 }] } },
  reserves: { league: 'fbad2', season: 80, locked: false, players: [{ playerId: 'p00023', position: 'SF', age: 21, rating: 55 }] },
  prevCollege: agePrevCollege(),
  board: ageBoard(),
  collegeTeams: ageCollegeTeams(),
  fbaTx: { league: 'fba', season: 80, entries: [] },
  collegeTx: { league: 'fbajc', season: 80, entries: [] },
  draftExists: false,
  ...over,
});


// ---- 7d: Draft board (S80) ----

/**
 * S80 college: t1 PG Rick One (Fr, committed recruit) · SG Sophie So (So 70) · SF X (Jr 66) · PF open · C Cal Center (Jr 74, 3 stars);
 * t2 PG X (Fr) · SG Fred Fresh (Fr 66) · SF Sid Soph (So 61) · PF Pat Portal (Jr 72, committed portal player) · C open.
 * Draft: Sam Senior (t1 PG, Sr, pro-rated 60) · Dan Draftee (t1 PF, Jr 70, pro-rated 65) · Eve Early (t2 C, So 68) · Tim Taken (t1 SG, Jr 72; Sophie holds his slot).
 * Pro reset (locked): rows Sam and Dan, order [Dan, Sam].
 */
export const draftBoardPlayers = (): PlayersFile => {
  const base = agePlayers();
  const extra = [
    ['p00030', 'Pat Portal'], ['p00031', 'Sophie So'], ['p00032', 'Fred Fresh'], ['p00033', 'Sid Soph'],
    ['p00034', 'Dan Draftee'], ['p00035', 'Eve Early'], ['p00036', 'Tim Taken'],
  ] as const;
  return { ...base, nextId: 37, players: { ...base.players, ...Object.fromEntries(extra.map(([id, name]) => [id, { id, name, birthSeason: null }])) } };
};

const dj = (playerId: string | null, position: Position, classYear: ClassYear | null, rating: number | null, stars: number | null = null): RosterEntry =>
  ({ playerId, position, rating, age: null, points: 0, stars, classYear });

export const draftBoardRosters = (): RostersFile => ({
  league: 'fbajc', season: 80, locked: false,
  teams: {
    t1: [dj('p00010', 'PG', 'Fr', 70, 3), dj('p00031', 'SG', 'So', 70), dj('p00002', 'SF', 'Jr', 66), dj(null, 'PF', null, null), dj('p00003', 'C', 'Jr', 74, 3)],
    t2: [dj('p00005', 'PG', 'Fr', 60), dj('p00032', 'SG', 'Fr', 66), dj('p00033', 'SF', 'So', 61), dj('p00030', 'PF', 'Jr', 72, 4), dj(null, 'C', null, null)],
  },
});

export const draftBoardBoard = (): RecruitingFile => ({
  ...ageBoard(), season: 79, classOf: 80,
  recruits: [{ playerId: 'p00010', position: 'PG', classYear: 'Fr', rating: 70, stars: 3, projections: {}, committedTo: 't1' }],
  portal: [{ playerId: 'p00030', position: 'PF', classYear: 'Jr', rating: 72, stars: 4, projections: {}, committedTo: 't2', fromTeam: 't1' }],
});

export const draftBoardDraft = (): DraftFile => ({
  league: 'fba', season: 80, locked: false, started: false, picks: [],
  prospects: [
    { playerId: 'p00001', position: 'PG', college: 't1', classYear: 'Sr', senior: true, collegeRating: 80, stars: 4, fbaRating: 60 },
    { playerId: 'p00034', position: 'PF', college: 't1', classYear: 'Jr', senior: false, collegeRating: 70, stars: 3, fbaRating: 65 },
    { playerId: 'p00035', position: 'C', college: 't2', classYear: 'So', senior: false, collegeRating: 68, stars: null, fbaRating: null },
    { playerId: 'p00036', position: 'SG', college: 't1', classYear: 'Jr', senior: false, collegeRating: 72, stars: 3, fbaRating: null },
  ],
});

export const draftBoardRatings = (): RankingFile => ({
  league: 'fba', season: 80, kind: 'fba-reset', locked: true,
  rows: ['p00001', 'p00034'].map(playerId => ({ playerId, position: 'PG' as Position, age: null, team: null, prevRating: null, otherRating: null, stat: null })),
  order: ['p00034', 'p00001'], ratings: { p00034: 65, p00001: 60 }, curve: [65, 60],
});

export const draftBoardState = (over: Partial<DraftBoardState> = {}): DraftBoardState => ({
  season: 80,
  draft: draftBoardDraft(),
  rosters: draftBoardRosters(),
  board: draftBoardBoard(),
  collegeTeams: ageCollegeTeams(),
  players: draftBoardPlayers(),
  collegeTx: { league: 'fbajc', season: 80, entries: [] },
  ratings: draftBoardRatings(),
  ...over,
});


// ---- 7d: Adjust Pro Ratings (S80) ----

/**
 * FBA S80: BOS has p00020 Pro A (PG, 70, age 21) and p00024 Pro E (SG, 65, age 30) plus a hole. S79: p00020 scored 400 for BOS and 12 for NYK.
 * Draft: p00001 Sam Senior (t1 Sr, college 80, born unknown) and p00012 Ron Three (t2 Fr, college 68, born 62, so age 18).
 * Calendar: Adjust Age is done, so Adjust Pro Ratings is current.
 */
export const proRatingsState = (over: Partial<ProRatingsState> = {}): ProRatingsState => {
  const cal = calendarFor(80);
  return {
    season: 80,
    calendar: { ...cal, steps: cal.steps.map(s => (s.id === 'adjust-age' ? { ...s, done: true } : s)) },
    fba: ageState().fba,
    prevFba: { league: 'fba', season: 79, locked: true, teams: {
      BOS: [{ playerId: 'p00020', position: 'PG', rating: 68, age: 20, points: 400 }],
      NYK: [{ playerId: 'p00020', position: 'PG', rating: 68, age: 20, points: 12 }],
    } },
    draft: {
      league: 'fba', season: 80, locked: false, started: false, picks: [],
      prospects: [
        { playerId: 'p00001', position: 'PG', college: 't1', classYear: 'Sr', senior: true, collegeRating: 80, stars: 4, fbaRating: null },
        { playerId: 'p00012', position: 'SF', college: 't2', classYear: 'Fr', senior: false, collegeRating: 68, stars: null, fbaRating: null },
      ],
    },
    players: agePlayers(),
    collegeTeams: ageCollegeTeams(),
    ratings: null,
    prevRatings: null,
    pause: null,
    tx: { league: 'fba', season: 80, entries: [] },
    ...over,
  };
};
