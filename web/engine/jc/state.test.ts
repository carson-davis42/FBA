import { describe, expect, it } from 'vitest';
import type { JcScheduleFile, ResultsFile, TeamsFile } from '../shared/types';
import { DAYS, TEAMS_PER_DAY, conferenceOf, dayPlayed, gamesPlayed, jcDocPath, jcFail, jcWrites, type JcState } from './state';

const game = (gameNo: number) => ({ gameNo, home: 'a', away: 'b', homePts: 80, awayPts: 70 });
const schedule: JcScheduleFile = {
  league: 'fbajc', season: 79, locked: false, tournaments: [], drawKeys: {},
  days: [
    { day: 1, kind: 'tournament', games: [{ gameNo: 1, home: 'a', away: 'b' }, { gameNo: 2, home: 'c', away: 'd' }] },
    { day: 2, kind: 'tournament', games: [{ gameNo: 3, home: 'a', away: 'c' }, { gameNo: 4, home: 'b', away: 'd' }] },
  ],
};
const teams = { league: 'fbajc', teams: [{ teamId: 'a', name: 'A', abbr: 'A', group: 'East', logoFolder: null, badge: { color: '#000000', text: '#ffffff' } }] } as unknown as TeamsFile;
const make = (games: number[]): JcState => ({
  season: 79, teams,
  rosters: {} as JcState['rosters'], players: {} as JcState['players'], calendar: {} as JcState['calendar'],
  schedule, rankings: null, postseason: null, awards: null, summary: null, board: null,
  results: { league: 'fbajc', season: 79, locked: false, games: games.map(game) } as ResultsFile,
});

describe('jc state helpers', () => {
  it('has the season constants', () => {
    expect(DAYS).toBe(29);
    expect(TEAMS_PER_DAY).toBe(108);
  });

  it('builds doc paths', () => {
    expect(jcDocPath('rankings', 79)).toBe('leagues/fbajc/S79/rankings.json');
    expect(jcDocPath('rosters', 79)).toBe('leagues/fbajc/S79/rosters.json');
  });

  it('maps changed keys to writes', () => {
    const state = make([]);
    const w = jcWrites({ ok: true, state: { ...state, rankings: { league: 'fbajc', season: 79, locked: false, snapshots: [] } }, changed: ['rankings', 'results'], label: 'x' });
    expect(w.map(x => x.path)).toEqual(['leagues/fbajc/S79/rankings.json', 'leagues/fbajc/S79/results.json']);
    expect(w[1].doc).toBe(state.results);
  });

  it('builds the postseason, awards and summary paths', () => {
    expect(jcDocPath('postseason', 79)).toBe('leagues/fbajc/S79/postseason.json');
    expect(jcDocPath('awards', 79)).toBe('leagues/fbajc/S79/awards.json');
    expect(jcDocPath('summary', 79)).toBe('leagues/fbajc/S79/summary.json');
  });

  it('counts played days', () => {
    expect(dayPlayed({ ...make([]), results: null })).toBe(0);
    expect(gamesPlayed({ ...make([]), results: null })).toBe(0);
    expect(dayPlayed(make([1, 2]))).toBe(1);
    expect(dayPlayed(make([1, 2, 3]))).toBe(1);
    expect(gamesPlayed(make([1, 2, 3]))).toBe(3);
    expect(dayPlayed(make([1, 2, 3, 4]))).toBe(2);
  });

  it('finds a conference and fails with problems', () => {
    expect(conferenceOf(teams, 'a')).toBe('East');
    expect(jcFail(['no'])).toEqual({ ok: false, problems: ['no'] });
  });
});
