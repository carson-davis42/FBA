import { describe, expect, it } from 'vitest';
import { EXPANSION_TEAMS } from '../engine/shared/expansion';
import { TeamsFile, type Team } from '../engine/shared/types';
import { refreshExpansionTeams } from './expansionTeams';

const old = (t: Team): Team => ({ ...t, logoFolder: 'FBA', logoFile: 'FBA_logo.png', badge: { bg: '#16346F', fg: '#ffffff' } });
const base: Team = { teamId: 'SAS', name: 'San Antonio Spirits', abbr: 'SAS', group: 'W', logoFolder: 'San Antonio Spirits', badge: { bg: '#111', fg: '#fff' } };

describe('refreshExpansionTeams', () => {
  it('gives the expansion teams already in the league their current logo folder and badge, and keeps everything else', () => {
    const renamed = { ...old(EXPANSION_TEAMS[1]), name: 'Boise Raptors', abbr: 'BOI' };
    const file = { league: 'fba', teams: [base, old(EXPANSION_TEAMS[0]), renamed] } as TeamsFile;
    const out = refreshExpansionTeams(file);
    expect(out.changed).toEqual(['PHI', 'LAL']);
    const [sas, phi, lal] = out.teams.teams;
    expect(sas).toEqual(base);
    expect(phi).toMatchObject({ logoFolder: EXPANSION_TEAMS[0].logoFolder, badge: EXPANSION_TEAMS[0].badge, name: 'Philly Phantoms' });
    // The name and abbreviation a team was given since stay; its logo and colours follow the definition.
    expect(lal).toMatchObject({ name: 'Boise Raptors', abbr: 'BOI', logoFolder: EXPANSION_TEAMS[1].logoFolder, badge: EXPANSION_TEAMS[1].badge });
    expect(lal.logoFile).toBeUndefined();
    expect(TeamsFile.safeParse(out.teams).success).toBe(true);
  });
  it('changes nothing when the teams are not there or already current', () => {
    const none = { league: 'fba', teams: [base] } as TeamsFile;
    expect(refreshExpansionTeams(none)).toEqual({ teams: none, changed: [] });
    const current = { league: 'fba', teams: [base, ...EXPANSION_TEAMS] } as TeamsFile;
    expect(refreshExpansionTeams(current).changed).toEqual([]);
  });
});
