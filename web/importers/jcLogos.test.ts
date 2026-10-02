import { describe, expect, it } from 'vitest';
import { Report } from './report';
import { JC_LOGO_FOLDER, wireJcLogos } from './jcLogos';
import { TeamsFile } from '../engine/shared/types';

const t = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: 'ACC', logoFolder: null, badge: { bg: 'hsl(1 50% 36%)', fg: '#ffffff' } });
const teams = { league: 'fbajc', teams: [t('DUKE', 'Duke'), t('TAMU', 'Texas A&M'), t('ACU', 'Abilene Christian'), t('NEW', 'No Logo U')] } as TeamsFile;

describe('wireJcLogos colours', () => {
  it('gives the badge the logo colours with readable text, and keeps the badge when a school has none', () => {
    const report = new Report();
    const out = wireJcLogos(teams, ['Duke.png', 'Texas A&M.png'], report, { Duke: { primary: '#0A3FA6', secondary: '#FFFFFF' }, 'Texas A&M': { primary: '#F4D03F', secondary: '#500000' } });
    expect(out.teams[0].badge).toEqual({ bg: '#0A3FA6', fg: '#fff', accent: '#FFFFFF' });
    expect(out.teams[1].badge).toEqual({ bg: '#F4D03F', fg: '#111', accent: '#500000' });
    const kept = wireJcLogos(teams, ['Duke.png'], report, {});
    expect(kept.teams[0].badge).toEqual(teams.teams[0].badge);
    expect(report.entries.some(e => e.message.includes('No logo colours for Duke'))).toBe(true);
    expect(TeamsFile.safeParse(out).success).toBe(true);
  });
});

describe('wireJcLogos', () => {
  it('points each team at its file and keeps the rest', () => {
    const report = new Report();
    const out = wireJcLogos(teams, ['Duke.png', 'Texas A&M.png', 'Abilene Christian.png', 'Stray.png'], report);
    expect(out.teams[0]).toMatchObject({ logoFolder: JC_LOGO_FOLDER, logoFile: 'Duke.png' });
    expect(out.teams[1].logoFile).toBe('Texas A&M.png');
    expect(out.teams[2].logoFile).toBe('Abilene Christian.png');
    expect(out.teams[3].logoFolder).toBeNull();
    expect(out.teams[3].logoFile).toBeUndefined();
    expect(report.entries.filter(e => e.level === 'warn' && !e.message.includes('colours')).map(e => e.message)).toEqual(['No logo file for No Logo U; its badge stays', 'Logo file Stray.png matches no team']);
    expect(TeamsFile.safeParse(out).success).toBe(true);
    expect(teams.teams[0].logoFolder).toBeNull();
  });
  it('is idempotent', () => {
    const once = wireJcLogos(teams, ['Duke.png'], new Report());
    expect(wireJcLogos(once, ['Duke.png'], new Report())).toEqual(once);
  });
});
