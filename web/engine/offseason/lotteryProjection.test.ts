import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { lotteryProjection } from './lotteryProjection';

const permutations = <T,>(items: T[]): T[][] => {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [x, ...p]));
};

/** P(each hidden team at each pick) by enumerating every full ordering of the lottery and keeping those that end in the revealed suffix. */
function brute(odds: { teamId: string; pct: number }[], revealed: string[]): Map<string, number[]> {
  const n = odds.length;
  const w = new Map(odds.map(o => [o.teamId, o.pct]));
  const m = n - revealed.length;
  const suffix = [...revealed].reverse(); // picks m+1..n
  const out = new Map<string, number[]>();
  const hidden = odds.filter(o => !revealed.includes(o.teamId)).map(o => o.teamId);
  for (const h of hidden) out.set(h, Array<number>(m).fill(0));
  let z = 0;
  for (const perm of permutations(odds.map(o => o.teamId))) {
    if (perm.slice(m).join() !== suffix.join()) continue;
    let p = 1;
    let pool = odds.reduce((s, o) => s + o.pct, 0);
    for (const id of perm) {
      p *= w.get(id)! / pool;
      pool -= w.get(id)!;
    }
    z += p;
    perm.slice(0, m).forEach((id, j) => { out.get(id)![j] += p; });
  }
  for (const arr of out.values()) arr.forEach((_, j, a) => { a[j] /= z; });
  return out;
}

const randomOdds = (n: number, seed: number) => {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({ teamId: `T${i}`, pct: 0.5 + Math.floor(rng() * 30) / 2 }));
};

describe('lotteryProjection', () => {
  for (const n of [4, 5, 6]) {
    for (const reveals of [0, 1, n - 2, n - 1]) {
      it(`matches brute force for ${n} teams with ${reveals} revealed`, () => {
        const odds = randomOdds(n, n * 100 + reveals);
        // Reveal from the last pick backwards, in an arbitrary fixed order.
        const order = [...odds].reverse().map(o => o.teamId);
        const revealed = order.slice(0, reveals);
        const proj = lotteryProjection(odds, revealed);
        const expected = brute(odds, revealed);
        expect(proj.hidden).toHaveLength(n - reveals);
        for (const t of proj.hidden) {
          const exp = expected.get(t.teamId)!;
          expect(t.pickProbs).toHaveLength(n - reveals);
          t.pickProbs.forEach((p, j) => expect(p).toBeCloseTo(exp[j], 10));
          expect(t.pFirst).toBeCloseTo(exp[0], 10);
          const mean = exp.reduce((s, p, j) => s + p * (j + 1), 0);
          expect(t.expected).toBeCloseTo(mean, 9);
        }
      });
    }
  }

  it('sums to 1 per team and per pick', () => {
    const odds = randomOdds(9, 7);
    const proj = lotteryProjection(odds, ['T8', 'T3']);
    for (const t of proj.hidden) expect(t.pickProbs.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
    for (let j = 0; j < 7; j++) expect(proj.hidden.reduce((s, t) => s + t.pickProbs[j], 0)).toBeCloseTo(1, 10);
  });

  it('is plain weighted draw for pick 1 with no reveals', () => {
    const proj = lotteryProjection([{ teamId: 'a', pct: 30 }, { teamId: 'b', pct: 10 }, { teamId: 'c', pct: 10 }], []);
    expect(proj.hidden.map(t => t.teamId)).toEqual(['a', 'b', 'c']);
    expect(proj.hidden[0].pFirst).toBeCloseTo(0.6, 12);
    expect(proj.hidden[1].pFirst).toBeCloseTo(0.2, 12);
  });

  it('orders ties by team id and breaks likely-pick ties toward the better pick', () => {
    const proj = lotteryProjection([{ teamId: 'b', pct: 10 }, { teamId: 'a', pct: 10 }], []);
    expect(proj.hidden.map(t => t.teamId)).toEqual(['a', 'b']);
    expect(proj.hidden[0].likely.pick).toBe(1);
    expect(proj.hidden[0].likely.p).toBeCloseTo(0.5, 12);
    expect(proj.hidden[0].expected).toBeCloseTo(1.5, 12);
  });

  it('handles zero weights without NaN', () => {
    const odds = [{ teamId: 'a', pct: 50 }, { teamId: 'b', pct: 20 }, { teamId: 'z', pct: 0 }, { teamId: 'y', pct: 0 }];
    const proj = lotteryProjection(odds, []);
    const z = proj.hidden.find(t => t.teamId === 'z')!;
    expect(z.pFirst).toBe(0);
    expect(z.best).toBeGreaterThan(1);
    for (const t of proj.hidden) {
      expect(t.pickProbs.every(p => Number.isFinite(p))).toBe(true);
      expect(t.pickProbs.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
    }
    const all0 = lotteryProjection([{ teamId: 'a', pct: 0 }, { teamId: 'b', pct: 0 }], []);
    expect(all0.hidden[0].pFirst).toBeCloseTo(0.5, 12);
  });

  it('leaves one team at pick 1 for sure when all but one are revealed', () => {
    const proj = lotteryProjection(randomOdds(5, 3), ['T4', 'T3', 'T2', 'T1']);
    expect(proj.hidden).toHaveLength(1);
    expect(proj.hidden[0].teamId).toBe('T0');
    expect(proj.hidden[0].pFirst).toBe(1);
    expect(proj.hidden[0]).toMatchObject({ expected: 1, best: 1, worst: 1, likely: { pick: 1, p: 1 } });
    expect(lotteryProjection(randomOdds(3, 1), ['T0', 'T1', 'T2']).hidden).toEqual([]);
  });

  it('reports best, worst and likely pick', () => {
    const odds = [{ teamId: 'a', pct: 90 }, { teamId: 'b', pct: 5 }, { teamId: 'c', pct: 5 }];
    const proj = lotteryProjection(odds, ['c']);
    const a = proj.hidden.find(t => t.teamId === 'a')!;
    expect(a.best).toBe(1);
    expect(a.worst).toBe(2);
    expect(a.likely.pick).toBe(1);
  });

  it('orders perPick rows by pick and keeps the top 3 teams', () => {
    const proj = lotteryProjection(randomOdds(6, 11), ['T5']);
    expect(proj.perPick.map(r => r.pick)).toEqual([1, 2, 3, 4, 5]);
    for (const row of proj.perPick) {
      expect(row.top).toHaveLength(3);
      for (let i = 1; i < 3; i++) expect(row.top[i - 1].p).toBeGreaterThanOrEqual(row.top[i].p);
      const t = proj.hidden.find(h => h.teamId === row.top[0].teamId)!;
      expect(row.top[0].p).toBeCloseTo(t.pickProbs[row.pick - 1], 12);
    }
    expect(lotteryProjection(randomOdds(3, 2), ['T2']).perPick[0].top).toHaveLength(2);
  });

  it('runs a 16-team projection well under 200 ms', () => {
    const odds = randomOdds(16, 99);
    const t0 = performance.now();
    const proj = lotteryProjection(odds, []);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(proj.hidden).toHaveLength(16);
    expect(proj.hidden.reduce((s, t) => s + t.pFirst, 0)).toBeCloseTo(1, 9);
  });

  it('throws on a revealed id that is not in the odds', () => {
    expect(() => lotteryProjection([{ teamId: 'a', pct: 1 }, { teamId: 'b', pct: 1 }], ['x'])).toThrow(/x.*not in the lottery/);
    expect(() => lotteryProjection([{ teamId: 'a', pct: 1 }, { teamId: 'b', pct: 1 }], ['a', 'a'])).toThrow(/more than once/);
  });
});
