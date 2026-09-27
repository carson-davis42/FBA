import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, shuffle } from './random';

describe('random helpers', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });

  it('randInt covers both ends inclusively', () => {
    expect(randInt(() => 0, -2, 2)).toBe(-2);
    expect(randInt(() => 0.5, -2, 2)).toBe(0);
    expect(randInt(() => 0.9999, -2, 2)).toBe(2);
  });

  it('shuffle is a Fisher–Yates permutation that leaves its input alone', () => {
    const input = ['a', 'b', 'c', 'd'];
    expect(shuffle(input, () => 0)).toEqual(['b', 'c', 'd', 'a']);
    expect(input).toEqual(['a', 'b', 'c', 'd']);
    const s = shuffle(input, mulberry32(7));
    expect([...s].sort()).toEqual(input);
  });
});
