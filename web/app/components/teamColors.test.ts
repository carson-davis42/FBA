import { describe, expect, it } from 'vitest';
import type { Team } from '../../engine/shared/types';
import { inkFor, teamTheme, teamVars } from './teamColors';

const team = (teamId: string): Team => ({ teamId, name: teamId, abbr: teamId, group: 'E', logoFolder: null, badge: { bg: 'hsl(10 55% 36%)', fg: '#ffffff' } });

describe('teamTheme', () => {
  it('uses the FBA table for FBA teams', () => {
    expect(teamTheme(team('ATL'), 'fba')).toEqual({ primary: '#B01818', secondary: '#111111', ink: '#fff' });
  });
  it('keeps white ink on the dark primaries in the table', () => {
    expect(teamTheme(team('TOR'), 'fba').ink).toBe('#fff');
    expect(teamTheme(team('LA'), 'fba').ink).toBe('#fff');
    expect(teamTheme(team('NY'), 'fba').ink).toBe('#fff');
  });
  it('falls back to the badge for other leagues and unknown teams', () => {
    expect(teamTheme(team('ATL'), 'fbad2')).toEqual({ primary: 'hsl(10 55% 36%)', secondary: 'hsl(10 55% 36%)', ink: '#ffffff' });
    expect(teamTheme(team('ZZZ'), 'fba').primary).toBe('hsl(10 55% 36%)');
  });
  it('exposes CSS variables', () => {
    expect(teamVars({ primary: '#000', secondary: '#111', ink: '#fff' })).toEqual({ '--team': '#000', '--team-2': '#111', '--team-ink': '#fff' });
  });
  it('inkFor uses relative luminance', () => {
    expect(inkFor('#F2B516')).toBe('#111');
    expect(inkFor('#111111')).toBe('#fff');
    expect(inkFor('#EFEFD0')).toBe('#111');
  });
});
