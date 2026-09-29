import { describe, expect, it } from 'vitest';
import { stepTarget, TOOL_STEPS, toolTarget } from './stepRoutes';

const step = (id: string, kind: 'offseason' | 'league' = 'offseason', league: 'fba' | 'fbad2' | 'fbajc' | null = null) =>
  ({ id, label: id, kind, league, sub: false, done: false });

describe('step routes', () => {
  it('opens the D2 tools from their calendar steps', () => {
    expect(TOOL_STEPS['fbad2-ratings-reset']).toBe('/league/fbad2/ratings');
    expect(TOOL_STEPS['fbad2-draft']).toBe('/league/fbad2/draft');
  });
  it('routes schedules and season play to their pages', () => {
    expect(toolTarget(step('make-s79-schedules'))).toBe('/schedules');
    expect(toolTarget(step('fba-d2', 'league', 'fbad2'))).toBe('/league/fbad2/scores');
    expect(toolTarget(step('fba', 'league', 'fba'))).toBe('/league/fba/scores');
    expect(stepTarget(step('fbajc', 'league', 'fbajc'))).toBe('/league/fbajc');
  });

  it('opens Create Class on the recruiting page', () => {
    expect(toolTarget(step('create-s80-class'))).toBe('/league/fbajc/recruiting?tab=class');
    expect(stepTarget(step('create-s81-class'))).toBe('/league/fbajc/recruiting?tab=class');
  });

  it('opens Rank Class on the class ranking page', () => {
    expect(toolTarget(step('rank-s80-class'))).toBe('/league/fbajc/class-ranking');
    expect(stepTarget(step('rank-s81-class'))).toBe('/league/fbajc/class-ranking');
    expect(toolTarget(step('rank-sx-class'))).toBeNull();
  });

  it('opens the draft lottery page from its calendar step', () => {
    expect(toolTarget(step('s80-fba-draft-lottery'))).toBe('/league/fba/lottery');
    expect(stepTarget(step('s81-fba-draft-lottery'))).toBe('/league/fba/lottery');
  });

  it('opens the retirement page from its calendar step', () => {
    expect(TOOL_STEPS.retirement).toBe('/retirement');
    expect(toolTarget(step('retirement'))).toBe('/retirement');
    expect(stepTarget(step('retirement'))).toBe('/retirement');
  });

  it('opens the Hall of Fame nominees tab from its calendar step', () => {
    expect(TOOL_STEPS['hall-of-fame-induction']).toBe('/league/fba/hall-of-fame?tab=nominees');
    expect(stepTarget(step('hall-of-fame-induction'))).toBe('/league/fba/hall-of-fame?tab=nominees');
  });
});
