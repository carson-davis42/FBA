import { describe, expect, it } from 'vitest';
import { DIVISION_LAYOUT } from '../engine/shared/divisions';
import type { TeamsFile } from '../engine/shared/types';
import { applyDivisions } from './divisions';

const badge = { bg: '#000', fg: '#fff' };
/** The pre-division league: ATL East, STL West, everyone else already in their layout conference. */
function oldFile(): TeamsFile {
  const teams = DIVISION_LAYOUT.flatMap(d => d.teams.map(teamId => {
    const group = teamId === 'ATL' ? 'E' : teamId === 'STL' ? 'W' : d.group;
    return { teamId, name: teamId, abbr: teamId, group, logoFolder: null, badge };
  }));
  return { league: 'fba', teams };
}

describe('applyDivisions', () => {
  const out = applyDivisions(oldFile());
  const get = (id: string) => out.teams.find(t => t.teamId === id)!;
  it('moves Atlanta to the West and St. Louis to the East, keeping their history', () => {
    expect(get('ATL')).toMatchObject({ group: 'W', division: 'GU', formerGroup: { through: 79, group: 'E' } });
    expect(get('STL')).toMatchObject({ group: 'E', division: 'GL', formerGroup: { through: 79, group: 'W' } });
  });
  it('gives the others a division and no formerGroup', () => {
    expect(get('DEN')).toMatchObject({ group: 'W', division: 'PA' });
    expect(get('DEN').formerGroup).toBeUndefined();
  });
  it('is idempotent and leaves 16 teams per conference', () => {
    expect(applyDivisions(out)).toEqual(out);
    expect(out.teams.filter(t => t.group === 'E')).toHaveLength(16);
    expect(out.teams.filter(t => t.group === 'W')).toHaveLength(16);
  });
  it('refuses a file that lacks a layout team', () => {
    const f = oldFile();
    expect(() => applyDivisions({ ...f, teams: f.teams.slice(1) })).toThrow();
  });
});
