import { describe, expect, it } from 'vitest';
import type { FranchisesFile, PlayersFile } from '../engine/shared/types';
import { buildDraftHistory, resolveSheetTeam } from './draftHistory';
import { Report } from './report';

const era = (name: string, abbr: string, from: number, to: number | null) => ({ name, abbr, city: name.split(' ')[0], from, to });
const file: FranchisesFile = {
  franchises: [
    { teamId: 'SEA', eras: [era('Seattle Shock', 'SEA', 59, null)] },
    { teamId: 'OV', eras: [era('Ohio Valley', 'OV', 1, null)] },
    { teamId: 'CGG', eras: [era('Cypress Green Guns', 'CGG', 1, 56)] },
    { teamId: 'CAR', eras: [era('Cal Tech Knights', 'CT', 41, 67)] },
  ],
};
const players: PlayersFile = { nextId: 2, players: { p00001: { id: 'p00001', name: 'Soren Lindberg', birthSeason: null } } };

describe('resolveSheetTeam', () => {
  it('resolves prefixes, aliases and unknowns', () => {
    expect(resolveSheetTeam(file, 'Seattle', 78)).toBe('SEA');
    expect(resolveSheetTeam(file, 'Cypress G', 49)).toBe('CGG');
    expect(resolveSheetTeam(file, 'Cal Tech', 49)).toBe('CAR');
    expect(resolveSheetTeam(file, 'Nowhere', 49)).toBeNull();
  });
});

describe('buildDraftHistory', () => {
  it('builds sorted drafts, undrafted rows and warnings', () => {
    const report = new Report();
    const doc = buildDraftHistory({
      S78: [
        ['Seattle(via OV)', 'Soren Lindberg', 'PG', 'Freshman', 'Arizona'],
        ['Nowhere', 'Unknown Guy', 'SG', 'Senior', 'LSU'],
        ['Undrafted', 'Cai Scott', 'SG', 'Senior', 'LSU'],
      ],
      'S75 exp': [['Cal Tech', 'Soren Lindberg', 'PG', '25', '']],
    }, { players, franchises: file, lastSeason: 79 }, report);
    expect(doc.drafts.map(d => `${d.season}:${d.kind}`)).toEqual(['75:expansion', '78:draft']);
    const d = doc.drafts[1];
    expect(d.picks[0]).toMatchObject({ pick: 1, teamId: 'SEA', viaTeamId: 'OV', playerId: 'p00001' });
    expect(d.picks[1]).toMatchObject({ pick: 2, teamId: null, teamName: 'Nowhere' });
    expect(d.picks[2]).toMatchObject({ pick: null, teamId: null, teamName: null, viaTeamId: null });
    const warns = report.entries.filter(e => e.level === 'warn');
    expect(warns.length).toBeGreaterThanOrEqual(2);
    expect(warns.every(w => w.topic === 'drafts')).toBe(true);
  });
});
