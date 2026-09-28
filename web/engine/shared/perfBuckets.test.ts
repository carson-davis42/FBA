import { describe, expect, it } from 'vitest';
import { zBuckets } from './perfBuckets';

describe('zBuckets', () => {
  it('buckets residuals of y regressed on x', () => {
    const rows = [
      { id: 'a', x: 70, y: 100 }, { id: 'b', x: 70, y: 100 }, { id: 'c', x: 70, y: 100 },
      { id: 'd', x: 70, y: 100 }, { id: 'e', x: 70, y: 300 },
    ];
    expect(Object.fromEntries(zBuckets(rows))).toEqual({ a: -1, b: -1, c: -1, d: -1, e: 2 });
  });
  it('is all zeros on a perfect fit and empty below 3 rows', () => {
    expect(Object.fromEntries(zBuckets([{ id: 'a', x: 60, y: 100 }, { id: 'b', x: 70, y: 200 }, { id: 'c', x: 80, y: 300 }]))).toEqual({ a: 0, b: 0, c: 0 });
    expect(zBuckets([{ id: 'a', x: 1, y: 1 }]).size).toBe(0);
  });
});
