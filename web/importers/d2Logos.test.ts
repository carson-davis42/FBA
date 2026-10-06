import { describe, expect, it } from 'vitest';
import { TeamsFile } from '../engine/shared/types';
import { D2_LOGO_FOLDER, logoStem, wireD2Logos } from './d2Logos';
import { Report } from './report';

const t = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: 'PL', logoFolder: null, badge: { bg: 'hsl(1 50% 36%)', fg: '#ffffff' } });
const teams = { league: 'fbad2', teams: [t('ROME', 'Roma Pallacanestro'), t('GDL', 'Guadalajara CB'), t('MUM', 'Mumbai BC'), t('SAL', 'Salzburg BC'), t('SJ', 'San Jose'), t('SAN', 'San'), t('NEW', 'No Logo City')] } as TeamsFile;
const colors = {
  'AS Roma Pallacanestro S79-pres.': { primary: '#7B1C23', secondary: '#C0946B' },
  'Roma Pallacanestro S79-pres.': { primary: '#7B1C23', secondary: '#C0946B' },
  'Guadalajara CB S79-pres.': { primary: '#0E4C37', secondary: '#EEE8BF' },
};

describe('logoStem', () => {
  it('drops the extension and the era from a logo file name', () => {
    expect(logoStem('Mumbai BC S79-pres..png')).toBe('Mumbai BC');
    expect(logoStem('Montreal S12-S56.png')).toBe('Montreal');
    expect(logoStem('Florida Panthers S11.png')).toBe('Florida Panthers');
    expect(logoStem('Duke.png')).toBe('Duke');
  });
});

describe('wireD2Logos', () => {
  it('matches a file to the team named at the start of it, and a listed alias for a differently named club', () => {
    const report = new Report();
    const out = wireD2Logos(teams, ['AS Roma Pallacanestro S79-pres..png', 'Guadalajara CB S79-pres..png', 'Mumbai BC S79-pres..png', 'Salzburg BC S79-pres..png'], report, colors);
    const of = (id: string) => out.teams.find(x => x.teamId === id)!;
    expect(of('ROME')).toMatchObject({ logoFolder: D2_LOGO_FOLDER, logoFile: 'AS Roma Pallacanestro S79-pres..png' });
    expect(of('GDL').logoFile).toBe('Guadalajara CB S79-pres..png');
    expect(of('MUM').logoFile).toBe('Mumbai BC S79-pres..png');
    expect(of('SAL').logoFile).toBe('Salzburg BC S79-pres..png');
    expect(of('NEW').logoFolder).toBeNull();
    expect(TeamsFile.safeParse(out).success).toBe(true);
  });

  it('uses the later file when a club has two logos, and says so', () => {
    const report = new Report();
    const out = wireD2Logos(teams, ['Roma Pallacanestro S79-pres..png', 'AS Roma Pallacanestro S79-pres..png'], report, colors);
    expect(out.teams.find(x => x.teamId === 'ROME')!.logoFile).toBe('Roma Pallacanestro S79-pres..png');
    expect(report.entries.filter(e => e.level === 'warn').map(e => e.message)).toEqual(['Roma Pallacanestro has two logos (AS Roma Pallacanestro S79-pres..png and Roma Pallacanestro S79-pres..png); using Roma Pallacanestro S79-pres..png']);
  });

  it('prefers the longest team name when one team name starts another', () => {
    const out = wireD2Logos(teams, ['San Jose BC S79-pres..png'], new Report());
    expect(out.teams.find(x => x.teamId === 'SJ')!.logoFile).toBe('San Jose BC S79-pres..png');
    expect(out.teams.find(x => x.teamId === 'SAN')!.logoFile).toBeUndefined();
  });

  it('gives the badge the logo colours with readable text, and keeps the badge when a logo has none', () => {
    const report = new Report();
    const out = wireD2Logos(teams, ['AS Roma Pallacanestro S79-pres..png', 'Mumbai BC S79-pres..png'], report, colors);
    expect(out.teams.find(x => x.teamId === 'ROME')!.badge).toEqual({ bg: '#7B1C23', fg: '#fff', accent: '#C0946B' });
    expect(out.teams.find(x => x.teamId === 'MUM')!.badge).toEqual(teams.teams[2].badge);
    expect(report.entries.some(e => e.message.includes('No logo colours for Mumbai BC'))).toBe(true);
  });

  it('reports a logo that matches no team, ignores non-PNG files, and does not change its input', () => {
    const report = new Report();
    wireD2Logos(teams, ['Atlantis BC S79-pres..png', 'sheet.jpg'], report, {});
    expect(report.entries.filter(e => e.level === 'warn').map(e => e.message)).toEqual(['Logo file Atlantis BC S79-pres..png matches no team']);
    expect(teams.teams[0].logoFolder).toBeNull();
  });

  it('is idempotent', () => {
    const once = wireD2Logos(teams, ['AS Roma Pallacanestro S79-pres..png'], new Report(), colors);
    expect(wireD2Logos(once, ['AS Roma Pallacanestro S79-pres..png'], new Report(), colors)).toEqual(once);
  });
});
