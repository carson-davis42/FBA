import { describe, expect, it } from 'vitest';
import { ageAdjusted } from './ageScore';

describe('ageAdjusted', () => {
  it('adds a point per year under 22: an 18-year-old 85 beats a 21-year-old 87', () => {
    expect(ageAdjusted(85, 18)).toBe(89);
    expect(ageAdjusted(87, 21)).toBe(88);
    expect(ageAdjusted(80, 22)).toBe(80);
  });
  it('takes a point off per year over 22', () => {
    expect(ageAdjusted(80, 24)).toBe(78);
  });
  it('treats ages as 18 to 26, so the adjustment stays within 4 points either way', () => {
    expect(ageAdjusted(80, 15)).toBe(84);
    expect(ageAdjusted(80, 40)).toBe(76);
  });
  it('gives no adjustment when the age is unknown, and nothing without a rating', () => {
    expect(ageAdjusted(80, null)).toBe(80);
    expect(ageAdjusted(null, 19)).toBeNull();
  });
});
