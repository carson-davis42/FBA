import { describe, expect, it } from 'vitest';
import { fieldFingerprint, revealPlan } from './reveal';

// A region's slots in the Java order: index i holds seed i + 1.
const region = (k: number) => Array.from({ length: 16 }, (_, i) => `r${k}s${i + 1}`);
const field = {
  mm: {
    teams: [0, 1, 2, 3].flatMap(region),
    seeds: Object.fromEntries([0, 1, 2, 3].flatMap(k => region(k).map(id => [id, Number(id.split('s')[1])]))),
    regions: [0, 1, 2, 3].map(region),
    firstFour: [],
  },
  nit: { teams: Array.from({ length: 32 }, (_, i) => `n${i}`) },
  warnings: [],
} as unknown as Parameters<typeof revealPlan>[0];

describe('revealPlan', () => {
  it('goes region 1 to 4, each region top to bottom of the bracket (1, 16, 8, 9, 5, 12, ...), then the bubble lists, then the NIT', () => {
    const plan = revealPlan(field);
    expect(plan).toHaveLength(64 + 3 + 32);
    const seeds = [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15];
    expect(plan.slice(0, 16).map(s => (s.kind === 'spot' ? s.id : ''))).toEqual(seeds.map(n => `r0s${n}`));
    expect(plan[16]).toEqual({ kind: 'spot', region: 1, id: 'r1s1' });
    expect(plan[17]).toEqual({ kind: 'spot', region: 1, id: 'r1s16' });
    expect(plan.slice(64, 67).map(s => (s.kind === 'bubble' ? s.section : ''))).toEqual(['in', 'eight', 'out']);
    expect(plan[67]).toEqual({ kind: 'nit', id: 'n0' });
  });
  it('fingerprints the field, so a different field gives a different value', () => {
    const swapped = { ...field, nit: { teams: [...field.nit.teams.slice(1), 'other'] } } as typeof field;
    expect(fieldFingerprint(field)).not.toBe(fieldFingerprint(swapped));
    expect(fieldFingerprint(field)).toBe(fieldFingerprint(field));
  });
});
