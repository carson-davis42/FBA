import { calendarFor } from '../shared/calendar';
import type { ClassYear, GameResult, PickObligation, PicksFile, PlayersFile, PlayoffsFile, Position, RecruitingFile, RosterEntry, RostersFile, TeamsFile, TransactionsFile } from '../shared/types';
import type { AdjustAgeState } from './adjustAge';
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
