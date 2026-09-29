import { calendarFor } from '../shared/calendar';
import type { GameResult, PickObligation, PicksFile, PlayoffsFile, TeamsFile, TransactionsFile } from '../shared/types';
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

