import { describe, expect, it } from 'vitest';
import { boosted, classBoost, classFromStat } from './classBoost';

describe('classBoost', () => {
  it('gives freshmen +4, sophomores +2, juniors +1 and seniors nothing', () => {
    expect([classBoost('Fr'), classBoost('So'), classBoost('Jr'), classBoost('Sr')]).toEqual([4, 2, 1, 0]);
  });
  it('gives nothing when the class is unknown', () => {
    expect(classBoost(null)).toBe(0);
    expect(classBoost(undefined)).toBe(0);
  });
  it('boosted adds it to a rating and keeps a missing rating missing', () => {
    expect(boosted(85, 'Fr')).toBe(89);
    expect(boosted(88, 'Jr')).toBe(89);
    expect(boosted(null, 'Fr')).toBeNull();
  });
  it('reads the class from a prospect row\'s stat line', () => {
    expect(classFromStat('So \u00b7 DUKE')).toBe('So');
    expect(classFromStat('S79: 412 pts')).toBeNull();
    expect(classFromStat(null)).toBeNull();
  });
});
