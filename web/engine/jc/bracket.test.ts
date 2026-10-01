import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { buildBracket, playableGames, recordResult, roundName, winnerOf } from './bracket';

const g = (id: string, round: number, next: { id: string; side: 'home' | 'away' } | null, home: string | null, away: string | null, homeSeed: number | null = null, awaySeed: number | null = null) =>
  ({ id, round, region: 0, home, away, homeSeed, awaySeed, next });
const four = () => buildBracket('T', 'conf', 'T', [
  g('A', 1, { id: 'F', side: 'home' }, 'a', 'b', 1, 4),
  g('B', 1, { id: 'F', side: 'away' }, 'c', 'd', 2, 3),
  g('F', 2, null, null, null),
]);
const res = (gameNo: number, home: string, away: string, homePts: number, awayPts: number): GameResult => ({ gameNo, home, away, homePts, awayPts });

describe('bracket helpers', () => {
  it('plays round 1 before round 2 and advances winners with their seeds', () => {
    let b = four();
    expect(playableGames(b).map(x => x.id)).toEqual(['A', 'B']);
    b = recordResult(b, 'A', res(1, 'a', 'b', 60, 70));
    expect(playableGames(b).map(x => x.id)).toEqual(['B']);
    expect(b.games.find(x => x.id === 'F')).toMatchObject({ home: 'b', homeSeed: 4, away: null });
    b = recordResult(b, 'B', res(2, 'c', 'd', 80, 70));
    expect(playableGames(b).map(x => x.id)).toEqual(['F']);
    expect(b.games.find(x => x.id === 'F')).toMatchObject({ home: 'b', away: 'c', awaySeed: 2 });
    expect(b.champion).toBeNull();
    b = recordResult(b, 'F', res(3, 'b', 'c', 61, 62));
    expect(b.champion).toBe('c');
    expect(playableGames(b)).toEqual([]);
    expect(winnerOf(b.games[0])).toBe('b');
  });

  it('refuses a replayed game, an unknown game, a game without both teams, wrong teams and a tie', () => {
    let b = four();
    expect(() => recordResult(b, 'F', res(1, 'a', 'b', 1, 0))).toThrow(/both teams/);
    expect(() => recordResult(b, 'Z', res(1, 'a', 'b', 1, 0))).toThrow(/no game/);
    expect(() => recordResult(b, 'A', res(1, 'a', 'x', 1, 0))).toThrow(/don't match/);
    expect(() => recordResult(b, 'A', res(1, 'a', 'b', 5, 5))).toThrow(/tied/);
    b = recordResult(b, 'A', res(1, 'a', 'b', 60, 70));
    expect(() => recordResult(b, 'A', res(1, 'a', 'b', 60, 70))).toThrow(/already played/);
  });

  it('does not change the bracket it was given', () => {
    const b = four();
    recordResult(b, 'A', res(1, 'a', 'b', 60, 70));
    expect(b.games[0].result).toBeNull();
  });

  it('names the rounds of each kind', () => {
    expect(roundName('conf', 1)).toBe('First Round');
    expect(roundName('conf', 4)).toBe('Final');
    expect(roundName('mm', 5)).toBe('Final Four');
    expect(roundName('nit', 1)).toBe('Round of 32');
  });
});
