import { describe, expect, it } from 'vitest';
import { DIVISIONS_SEASON, DIVISION_LAYOUT, divisionName } from './divisions';

describe('division layout', () => {
  it('has four divisions of eight, 32 distinct teams', () => {
    expect(DIVISION_LAYOUT.map(d => d.division)).toEqual(['AT', 'GL', 'PA', 'GU']);
    for (const d of DIVISION_LAYOUT) expect(d.teams).toHaveLength(8);
    expect(new Set(DIVISION_LAYOUT.flatMap(d => d.teams)).size).toBe(32);
  });
  it('puts Atlantic and Great Lakes in the East, Pacific and Gulf in the West', () => {
    expect(DIVISION_LAYOUT.map(d => d.group)).toEqual(['E', 'E', 'W', 'W']);
  });
  it('names the divisions and starts in S80', () => {
    expect(divisionName('GL')).toBe('Great Lakes');
    expect(divisionName(undefined)).toBe('');
    expect(DIVISIONS_SEASON).toBe(80);
  });
});
