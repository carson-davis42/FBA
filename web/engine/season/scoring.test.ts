import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { GameResult } from '../shared/types';
import { toGameResult } from './moves';
import { scoringLines, shotMoments } from './scoring';
import { JC_PROFILE, makeChance, shotPoints, simGame, type SimTeam } from './sim';

const team = (teamId: string, rating: number): SimTeam => ({ teamId, players: ['PG', 'SG', 'SF', 'PF', 'C'].map((position, i) =>
  ({ playerId: `${teamId}${i}`, position: position as SimTeam['players'][number]['position'], rating })),
});

describe('scoring expectations', () => {
  it.each([35, 50, 65])('matches every possible shot roll at make chance %s for both sim profiles', odds => {
    for (const offset of [0, 1]) {
      const points = Array.from({ length: 100 }, (_, i) => shotPoints(odds, i + offset));
      const mean = points.reduce<number>((a, b) => a + b, 0) / 100;
      const variance = points.reduce<number>((sum, p) => sum + (p - mean) ** 2, 0) / 100;
      expect(shotMoments(odds, offset).exp).toBeCloseTo(mean * 100);
      expect(shotMoments(odds, offset).variance).toBeCloseTo(variance * 10000);
    }
  });

  it('records actual shot opportunities and matchup expectations in schema-valid results', () => {
    const g = simGame(1, team('A', 80), team('B', 90), mulberry32(5));
    const stats = scoringLines(g);
    for (const side of ['home', 'away'] as const) {
      const possessions = g.possessions.filter(p => p.offense === side);
      expect(stats[side].reduce((sum, p) => sum + p.att, 0)).toBe(possessions.length);
      for (let i = 0; i < 5; i++) {
        const count = possessions.filter(p => p.handler === i).length;
        const expectation = shotMoments(makeChance(side === 'home' ? 80 : 90, side === 'home' ? 90 : 80));
        expect(stats[side][i]).toEqual({ att: count, offExp: count * expectation.exp, offVar: count * expectation.variance });
      }
    }
    const saved = toGameResult(g, 85);
    expect(GameResult.safeParse(saved).success).toBe(true);
    expect(saved.box!.home[0]).toMatchObject(stats.home[0]);
    expect(saved.box!.home[0].def).toBeTypeOf('number');
  });

  it('uses the college shot-roll convention when saving college games', () => {
    const g = simGame(1, team('A', 80), team('B', 80), mulberry32(1), JC_PROFILE);
    const row = toGameResult(g).box!.home[0];
    const expectation = shotMoments(makeChance(80, 80), 0);
    expect(row.offExp).toBe(row.att! * expectation.exp);
    expect(row.offVar).toBe(row.att! * expectation.variance);
  });
});
