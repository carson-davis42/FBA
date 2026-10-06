import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import {
  defenderWeights, FBA_PROFILE, isClutch, JC_PROFILE, makeChance, periodOf, pickDefender, pickHandler, REGULATION, shotPoints, simGame, touchShare, type SimTeam, usagePenalty, winProbability,
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

describe('FBAJC profile', () => {
  it('pickHandler: a 55-rated player gets the ball with (rating - 40) weights', () => {
    const t = team('J', [90, 80, 70, 65, 55]); // weights 50, 40, 30, 25, 15 -> total 160 (sum 360 - 200)
    expect(pickHandler(t, seq(144.5 / 160), JC_PROFILE)).toBe(3);
    expect(pickHandler(t, seq(159.5 / 160), JC_PROFILE)).toBe(4);
    // the FBA weighting never reaches the 55 (and a 65 gets almost nothing)
    expect(pickHandler(t, seq(0.999999))).not.toBe(4);
  });
  it('a 55-rated player scores in simulated JC games and never in FBA games', () => {
    const rng = mulberry32(5);
    let jc = 0;
    let fba = 0;
    for (let i = 0; i < 20; i++) {
      jc += simGame(i, team('A', [90, 80, 70, 65, 55]), team('B', [85, 75, 72, 60, 58]), rng, JC_PROFILE).box.home[4];
      fba += simGame(i, team('A', [90, 80, 70, 65, 55]), team('B', [85, 75, 72, 60, 58]), rng).box.home[4];
    }
    expect(jc).toBeGreaterThan(0);
    expect(fba).toBe(0);
  });
  it('rolls 0..99 for the JC (odds 65 makes roll 65) and 1..100 for the FBA (roll 66 misses)', () => {
    const hi = team('H', [99, 99, 99, 99, 99]);
    const lo = team('L', [40, 40, 40, 40, 40]);
    const r = (): Rng => { const rest = mulberry32(9); const first = [0, 0, 0.65]; let k = 0; return () => (k < 3 ? first[k++] : rest()); };
    expect(simGame(1, hi, lo, r(), JC_PROFILE).possessions[0].made).toBe(true);
    expect(simGame(1, hi, lo, r()).possessions[0].made).toBe(false);
  });
  it('FBA results do not depend on passing the profile explicitly', () => {
    const t = (id: string, r: number[]) => team(id, r);
    const g = simGame(1, t('A', [90, 80, 70, 65, 58]), t('B', [85, 75, 72, 60, 55]), mulberry32(42));
    expect([g.homePts, g.awayPts, g.possessions.length]).toEqual([95, 70, 120]);
    expect(g.box).toEqual({ home: [58, 27, 8, 2, 0], away: [42, 14, 14, 0, 0] });
    const e = simGame(1, t('A', [90, 80, 70, 65, 58]), t('B', [85, 75, 72, 60, 55]), mulberry32(42), FBA_PROFILE);
    expect(e).toEqual(g);
  });
});

describe('usage penalty', () => {
  const star = team('S', [98, 73, 73, 73, 73]);
  const balanced = team('B', [78, 78, 78, 78, 78]);

  it('touch share is the rating-over-base weight over the team total', () => {
    expect(touchShare(star, 0, FBA_PROFILE)).toBeCloseTo(38 / 90, 6);
    expect(touchShare(balanced, 2, FBA_PROFILE)).toBeCloseTo(0.2, 6);
    expect(touchShare(team('Z', [60, 60, 60, 60, 60]), 0, FBA_PROFILE)).toBe(0.2);
  });

  it('costs make chance only above an even share, and never in the FBAJC', () => {
    expect(usagePenalty(0.2, FBA_PROFILE)).toBe(0);
    expect(usagePenalty(0.1, FBA_PROFILE)).toBe(0);
    expect(usagePenalty(0.4, FBA_PROFILE)).toBeCloseTo(2, 6);
    expect(usagePenalty(0.4, JC_PROFILE)).toBe(0);
  });

  it('makes a star plus role players about even with a balanced team of the same total rating', () => {
    const rng = mulberry32(2026);
    let wins = 0;
    const n = 6000;
    for (let g = 0; g < n; g++) {
      const starHome = g % 2 === 0;
      const r = simGame(g, starHome ? star : balanced, starHome ? balanced : star, rng);
      if (starHome ? r.homePts > r.awayPts : r.awayPts > r.homePts) wins++;
    }
    expect(wins / n).toBeGreaterThan(0.45);
    expect(wins / n).toBeLessThan(0.54);
  });

  it('still lets two stars beat a balanced team', () => {
    const rng = mulberry32(7);
    let wins = 0;
    const n = 3000;
    const two = team('T', [95, 95, 68, 68, 68]);
    for (let g = 0; g < n; g++) {
      const r = simGame(g, g % 2 === 0 ? two : balanced, g % 2 === 0 ? balanced : two, rng);
      if (g % 2 === 0 ? r.homePts > r.awayPts : r.awayPts > r.homePts) wins++;
    }
    expect(wins / n).toBeGreaterThan(0.62);
  });

  it('keeps scoring level from the first quarter to the last', () => {
    const rng = mulberry32(99);
    const q = [0, 0, 0, 0];
    const n = 1500;
    for (let g = 0; g < n; g++) {
      const r = simGame(g, star, balanced, rng);
      for (const side of ['home', 'away'] as const) for (let i = 0; i < 4; i++) q[i] += r.periods[side][i];
    }
    expect(Math.max(...q) / Math.min(...q)).toBeLessThan(1.05);
  });
});
