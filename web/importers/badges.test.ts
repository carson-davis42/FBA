import { describe, expect, it } from 'vitest';
import { badgeFor } from './badges';

describe('badgeFor', () => {
  it('is deterministic', () => {
    expect(badgeFor('Duke')).toEqual(badgeFor('Duke'));
  });
  it('produces an hsl background and white text', () => {
    expect(badgeFor('Salzburg')).toMatchObject({ bg: expect.stringMatching(/^hsl\(\d{1,3} 55% 36%\)$/), fg: '#ffffff' });
  });
  it('varies by name', () => {
    expect(badgeFor('Duke').bg).not.toBe(badgeFor('Kentucky').bg);
  });
});
