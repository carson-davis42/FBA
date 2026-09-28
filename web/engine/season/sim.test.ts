import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import {
  defenderWeights, isClutch, makeChance, periodOf, pickDefender, pickHandler, REGULATION, shotPoints, simGame, type SimTeam, winProbability,
} from './sim';

const team = (id: string, ratings: number[]): SimTeam => ({
  teamId: id,
  players: ratings.map((rating, k) => ({ playerId: `${id}${k}`, position: POSITIONS[k], rating })),
});
const seq = (...xs: number[]): Rng => { let k = 0; return () => xs[k++ % xs.length]; };

describe('pickHandler', () => {
  const t = team('A', [90, 80, 70, 65, 60]); // weights 30, 20, 10, 5, 0 → total 65
  it('draws the Java way: floor(rng*total)+1 against cumulative rating-60', () => {
    expect(pickHandler(t, seq(0))).toBe(0);
    expect(pickHandler(t, seq(30.5 / 65))).toBe(1);
    expect(pickHandler(t, seq(64.5 / 65))).toBe(3);
  });
  it('falls back to a uniform pick when the total is not positive', () => {
    expect(pickHandler(team('B', [60, 60, 60, 60, 60]), seq(0.99))).toBe(4);
  });
});

describe('defender choice', () => {
  it('weights by position distance and rating closeness', () => {
    const w = defenderWeights(team('D', [80, 80, 80, 80, 80]), { playerId: 'x', position: 'PG', rating: 80 }, 0);
    [16, 8, 1.2, 0.008, 0.008].forEach((v, k) => expect(w[k]).toBeCloseTo(v, 10));
  });
  it('walks the cumulative weights', () => {
    const d = team('D', [80, 80, 80, 80, 80]);
    const o = team('O', [80, 80, 80, 80, 80]);
    expect(pickDefender(d, o, 0, seq(0))).toBe(0);
    expect(pickDefender(d, o, 0, seq(0.999999))).toBe(4);
  });
});

describe('shooting', () => {
  it('clamps the make chance to 35..65', () => {
    expect(makeChance(99, 99)).toBe(65);
    expect(makeChance(60, 99)).toBe(35);
    expect(makeChance(80, 80)).toBe(54);
  });
  it('scores 3 on a margin of 30 or more, 2 otherwise, 0 on a miss', () => {
    expect(shotPoints(54, 54)).toBe(2);
    expect(shotPoints(54, 24)).toBe(3);
    expect(shotPoints(54, 25)).toBe(2);
    expect(shotPoints(54, 55)).toBe(0);
  });
});

describe('clock helpers', () => {
  it('numbers periods: 4 quarters of 30, then OTs of 10', () => {
    expect([0, 29, 30, 119, 120, 129, 130].map(periodOf)).toEqual([1, 1, 2, 4, 5, 5, 6]);
  });
  it('detects the clutch window', () => {
    expect(isClutch(109, 120, 0)).toBe(false);
    expect(isClutch(110, 120, 15)).toBe(true);
    expect(isClutch(110, 120, 16)).toBe(false);
    expect(isClutch(119, 120, 3)).toBe(true);
    expect(isClutch(119, 120, 4)).toBe(false);
  });
});

describe('simGame', () => {
  const home = team('H', [92, 85, 80, 78, 75]);
  const away = team('A', [88, 84, 82, 79, 77]);

  it('is deterministic for a seed', () => {
    expect(simGame(1, home, away, mulberry32(7))).toEqual(simGame(1, home, away, mulberry32(7)));
  });

  it('keeps every invariant', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = simGame(seed, home, away, mulberry32(seed));
      expect(g.possessions.length).toBe(REGULATION + 10 * g.ot);
      g.possessions.forEach((p, i) => {
        expect(p.i).toBe(i);
        expect(p.offense).toBe(i % 2 === 0 ? 'home' : 'away');
        expect([0, 2, 3]).toContain(p.points);
        expect(p.made).toBe(p.points > 0);
      });
      expect(g.homePts).not.toBe(g.awayPts);
      expect(g.box.home.reduce((a, b) => a + b, 0)).toBe(g.homePts);
      expect(g.box.away.reduce((a, b) => a + b, 0)).toBe(g.awayPts);
      expect(g.periods.home.reduce((a, b) => a + b, 0)).toBe(g.homePts);
      expect(g.periods.home.length).toBe(4 + g.ot);
      expect(g.possessions.at(-1)!.end).toBe(g.possessions.length);
    }
  });

  it('plays 10-possession overtimes while tied', () => {
    const even = team('E', [80, 80, 80, 80, 80]);
    const even2 = team('F', [80, 80, 80, 80, 80]);
    let found = null;
    for (let seed = 1; seed <= 3000 && !found; seed++) {
      const g = simGame(seed, even, even2, mulberry32(seed));
      if (g.ot > 0) found = g;
    }
    expect(found).not.toBeNull();
    expect(found!.possessions[119].homeScore).toBe(found!.possessions[119].awayScore);
    expect(found!.possessions.length).toBe(120 + 10 * found!.ot);
  });
});

describe('winProbability', () => {
  const home = team('H', [85, 85, 85, 85, 85]);
  const away = team('A', [85, 85, 85, 85, 85]);
  it('is certain once the game is over', () => {
    const g = simGame(1, home, away, mulberry32(3));
    expect(winProbability(g, g.possessions.length, mulberry32(1))).toBe(g.homePts > g.awayPts ? 1 : 0);
  });
  it('is near even at tip-off for equal teams', () => {
    const g = simGame(1, home, away, mulberry32(3));
    const p = winProbability(g, 0, mulberry32(9), 400);
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(0.7);
  });
});
