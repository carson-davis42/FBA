import { describe, expect, it } from 'vitest';
import type { Team } from '../../engine/shared/types';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COLOR_ERAS, inkFor, setCurrentSeason, teamTheme, teamVars } from './teamColors';

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

describe('teamTheme for a team without hand-picked colours', () => {
  it('uses the badge accent as the second colour', () => {
    const team = { teamId: 'DUKE', name: 'Duke', abbr: 'DUKE', group: 'ACC', logoFolder: null, badge: { bg: '#0A3FA6', fg: '#fff', accent: '#C8102E' } };
    expect(teamTheme(team, 'fbajc')).toEqual({ primary: '#0A3FA6', secondary: '#C8102E', ink: '#fff' });
    expect(teamTheme({ ...team, badge: { bg: '#0A3FA6', fg: '#fff' } }, 'fbajc').secondary).toBe('#0A3FA6');
  });
});

describe('colours follow the logo era', () => {
  const oak = team('OAK');
  it('keeps the old pair until the new logo starts, then switches', () => {
    expect(teamTheme(oak, 'fba', 79)).toMatchObject({ primary: '#3F7F3F', secondary: '#F2B416' });
    expect(teamTheme(oak, 'fba', 80)).toMatchObject({ primary: '#0B7A3E', secondary: '#F5B800' });
    expect(teamTheme(oak, 'fba', 95).primary).toBe('#0B7A3E');
  });
  it('uses the season of a past page: before the first era entry the base pair applies', () => {
    expect(teamTheme(oak, 'fba', 20).primary).toBe('#3F7F3F');
  });
  it('defaults to the current season, which the shell sets', () => {
    setCurrentSeason(79);
    expect(teamTheme(oak, 'fba').primary).toBe('#3F7F3F');
    setCurrentSeason(80);
    expect(teamTheme(oak, 'fba').primary).toBe('#0B7A3E');
    setCurrentSeason(79);
  });
  it('picks the ink for the primary of the era', () => {
    expect(teamTheme(team('DEN'), 'fba', 80)).toMatchObject({ primary: '#2A1610', ink: '#fff' });
  });
  it('has colours for every future logo in the committed manifest (a new logo must come with its colours)', () => {
    const dir = path.join(__dirname, '..', '..', 'data');
    const manifest = JSON.parse(readFileSync(path.join(dir, 'logos', 'manifest.json'), 'utf8')) as { folders: Record<string, { from: number | null; variant: number }[]> };
    const teams = (JSON.parse(readFileSync(path.join(dir, 'leagues', 'fba', 'teams.json'), 'utf8')) as { teams: { teamId: string; logoFolder: string | null }[] }).teams;
    const missing: string[] = [];
    for (const t of teams) {
      if (!t.logoFolder) continue;
      const entries = (manifest.folders[t.logoFolder] ?? []).filter(e => e.variant === 0 && e.from !== null);
      for (const e of entries) {
        // A team's first logo comes with its base pair in TEAM_COLORS; only a change of logo needs a colour era.
        const changed = entries.some(o => o.from! < e.from!);
        if (changed && e.from! >= 80 && !(COLOR_ERAS[t.teamId] ?? []).some(c => c.from === e.from)) missing.push(`${t.teamId} S${e.from}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
