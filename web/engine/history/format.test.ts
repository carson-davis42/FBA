import { describe, expect, it } from 'vitest';
import { formatScore } from './format';

describe('formatScore', () => {
  it('shows a dash for a missing score', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
    expect(formatScore('')).toBe('—');
  });
  it('turns a hyphen between digits into an en dash', () => {
    expect(formatScore('4-1')).toBe('4–1');
    expect(formatScore('12 - 3')).toBe('12–3');
  });
  it('leaves an en dash alone', () => {
    expect(formatScore('4–1')).toBe('4–1');
  });
});
