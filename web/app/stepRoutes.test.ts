import { describe, expect, it } from 'vitest';
import { TOOL_STEPS } from './stepRoutes';

describe('TOOL_STEPS', () => {
  it('opens the D2 ratings reset from its calendar step', () => {
    expect(TOOL_STEPS['fbad2-ratings-reset']).toBe('/league/fbad2/ratings');
  });

  it('opens the D2 draft from its calendar step', () => {
    expect(TOOL_STEPS['fbad2-draft']).toBe('/league/fbad2/draft');
  });
});
