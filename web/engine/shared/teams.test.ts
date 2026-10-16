import { describe, expect, it } from 'vitest';
import { Team, TeamsFile } from './types';
import { teamsInSeason, teamsJoining } from './teams';
import { EXPANSION_TEAMS } from './expansion';
import { lotterySizeFor } from './league';

const t = (teamId: string, fromSeason?: number) => ({
  teamId, name: teamId, abbr: teamId, group: 'E', logoFolder: null, badge: { bg: '#000', fg: '#fff' }, ...(fromSeason ? { fromSeason } : {}),
});
const file = { league: 'fba' as const, teams: [t('A'), t('B', 80), t('C', 81)] };

describe('teamsInSeason', () => {
  it('keeps teams without fromSeason and those that have started', () => {
    expect(teamsInSeason(file, 79).teams.map(x => x.teamId)).toEqual(['A']);
    expect(teamsInSeason(file, 80).teams.map(x => x.teamId)).toEqual(['A', 'B']);
  });
  it('does not mutate its input', () => {
    teamsInSeason(file, 79);
    expect(file.teams).toHaveLength(3);
  });
});
describe('teamsJoining', () => {
  it('lists the teams whose fromSeason is exactly that season', () => {
    expect(teamsJoining(file, 80).map(x => x.teamId)).toEqual(['B']);
  });
});
describe('schema and definition', () => {
  it('accepts fromSeason and still rejects unknown fields', () => {
    expect(Team.safeParse(t('A', 80)).success).toBe(true);
    expect(Team.safeParse({ ...t('A'), extra: 1 }).success).toBe(false);
    expect(Team.safeParse({ ...t('A'), fromSeason: 0 }).success).toBe(false);
  });
  it('defines PHI (East) and LAL (West) from S80, valid as a TeamsFile', () => {
    expect(EXPANSION_TEAMS.map(x => [x.teamId, x.group, x.fromSeason])).toEqual([['PHI', 'E', 80], ['LAL', 'W', 80]]);
    expect(TeamsFile.safeParse({ league: 'fba', teams: EXPANSION_TEAMS }).success).toBe(true);
    const lal = EXPANSION_TEAMS[1];
    expect([lal.name, lal.abbr, lal.logoFolder, lal.logoFile]).toEqual(['Boise Raptors', 'BOI', 'Team 32', undefined]);
    expect(EXPANSION_TEAMS[0].logoFolder).toBe('Philly Phantoms');
  });
  it('derives the lottery size from the team count', () => {
    expect([lotterySizeFor(30), lotterySizeFor(32)]).toEqual([14, 16]);
  });
});
