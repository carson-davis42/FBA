import { describe, expect, it } from 'vitest';
import type { BoxLine, GameResult, WorldCupFile } from '../shared/types';
import { MVP_MIN_GAMES, tournamentMvpCandidates, type MvpNames } from './mvp';
import { runFullWorldCup } from './testRun';

const names: MvpNames = { player: id => `Name ${id}`, team: id => ({ ITA: 'Italy', GER: 'Germany' })[id] ?? id };
const line = (playerId: string, pts: number): BoxLine => ({ playerId, pts }) as BoxLine;
const game = (gameNo: number, home: string, away: string, h: BoxLine[], a: BoxLine[]): GameResult => ({ gameNo, home, away, homePts: 90, awayPts: 80, box: { home: h, away: a } });
const wcOf = (groupGames: GameResult[], knockout: WorldCupFile['knockout'] = []): WorldCupFile =>
  ({ league: 'fbawc', season: 80, host: 'ITA', field: [], pots: [], groups: {}, keys: {}, schedule: [], groupGames, knockout, champion: null, runnerUp: null }) as unknown as WorldCupFile;

describe('tournamentMvpCandidates', () => {
  it('keeps gp >= 3, rounds ppg and sorts by ppg, points, name', () => {
    expect(MVP_MIN_GAMES).toBe(3);
    const wc = wcOf(
      [
        game(1, 'ITA', 'GER', [line('p00001', 20), line('ITA:PG', 10)], [line('p00002', 10), line('p00003', 30)]),
        game(2, 'GER', 'ITA', [line('p00002', 10)], [line('p00001', 21), line('ITA:PG', 10), line('p00003', 30)]),
      ],
      [
        { id: 'F-1', round: 'F', home: 'ITA', away: 'GER', game: game(3, 'ITA', 'GER', [line('p00001', 22), line('ITA:PG', 11)], [line('p00002', 11), line('p00003', 30)]) },
        { id: 'QF-1', round: 'QF', home: null, away: null, game: null },
      ],
    );
    const c = tournamentMvpCandidates(wc, names);
    expect(c.map(x => x.key)).toEqual(['p00003', 'p00001', 'ITA:PG', 'p00002']);
    expect(c[0]).toMatchObject({ gp: 3, ppg: 30, teamId: 'GER', generated: false, name: 'Name p00003' });
    expect(c[1].ppg).toBe(21);
    expect(c[3].ppg).toBe(10.3);
    expect(c[2]).toMatchObject({ generated: true, name: 'Italy PG (Generated)', teamId: 'ITA', ppg: 10.3 });
    expect(tournamentMvpCandidates(wcOf([game(1, 'ITA', 'GER', [line('p00001', 5)], [])]), names)).toEqual([]);
  });

  it('works on a real run', () => {
    const { w } = runFullWorldCup(79);
    const c = tournamentMvpCandidates(w.worldCup!, { player: id => id, team: id => id });
    expect(c.length).toBeGreaterThan(50);
    for (let i = 1; i < c.length; i++) expect(c[i - 1].ppg).toBeGreaterThanOrEqual(c[i].ppg);
  });
});
