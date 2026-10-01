import { describe, expect, it } from 'vitest';
import { Report } from './report';
import { JC_LOGO_FOLDER, wireJcLogos } from './jcLogos';
import { TeamsFile } from '../engine/shared/types';

const t = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: 'ACC', logoFolder: null, badge: { bg: 'hsl(1 50% 36%)', fg: '#ffffff' } });
const teams = { league: 'fbajc', teams: [t('DUKE', 'Duke'), t('TAMU', 'Texas A&M'), t('ACU', 'Abilene Christian'), t('NEW', 'No Logo U')] } as TeamsFile;

describe('wireJcLogos', () => {
  it('points each team at its file and keeps the rest', () => {
    const report = new Report();
    const out = wireJcLogos(teams, ['Duke.png', 'Texas A&M.png', 'Abilene Christian.png', 'Stray.png'], report);
    expect(out.teams[0]).toMatchObject({ logoFolder: JC_LOGO_FOLDER, logoFile: 'Duke.png' });
    expect(out.teams[1].logoFile).toBe('Texas A&M.png');
    expect(out.teams[2].logoFile).toBe('Abilene Christian.png');
    expect(out.teams[3].logoFolder).toBeNull();
    expect(out.teams[3].logoFile).toBeUndefined();
    expect(report.entries.filter(e => e.level === 'warn').map(e => e.message)).toEqual(['No logo file for No Logo U; its badge stays', 'Logo file Stray.png matches no team']);
    expect(TeamsFile.safeParse(out).success).toBe(true);
    expect(teams.teams[0].logoFolder).toBeNull();
  });
  it('is idempotent', () => {
    const once = wireJcLogos(teams, ['Duke.png'], new Report());
    expect(wireJcLogos(once, ['Duke.png'], new Report())).toEqual(once);
  });
});
