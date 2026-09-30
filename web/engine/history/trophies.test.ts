import { describe, expect, it } from 'vitest';
import { trophyCase, type TrophyInput } from './trophies';
import type { FranchisesFile, HallOfFameFile, SummaryFile, Team } from '../shared/types';

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('SAS', 'San Antonio Spirits', 'SAS'), team('MON', 'Montreal Chevaliers', 'MON')];
const franchises: FranchisesFile = {
  franchises: [
    { teamId: 'SAS', eras: [
      { name: 'San Antonio Spirits', abbr: 'SAS', city: 'San Antonio, Texas', from: 57, to: null },
      { name: 'San Antonio', abbr: 'USA', city: 'San Antonio, Texas', from: 1, to: 56 },
    ] },
    { teamId: 'MON', eras: [{ name: 'Montreal', abbr: 'MON', city: 'Montreal, Quebec, Canada', from: 1, to: null }] },
  ],
};
const base = { league: 'fba', locked: true, host: null } as const;
const s20 = {
  ...base, season: 20,
  champions: [{ title: 'FBA Champion', champion: 'San Antonio', runnerUp: 'Montreal', score: '1–0' }],
  confChampions: { E: 'Montreal', W: 'San Antonio' },
  awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'USA' }, { award: 'MVP-PL', playerId: 'p00002', teamId: 'USA' }],
} as SummaryFile;
const s60 = {
  ...base, season: 60, champions: [],
  pastBracket: { rounds: 1, series: [{ id: 'R1-1', round: 1, home: { name: 'San Antonio Spirits', record: null, seed: null }, away: { name: 'Montreal', record: null, seed: null }, homeWins: 1, awayWins: 0, winner: 'home' }] },
} as SummaryFile;
const s79 = {
  ...base, season: 79,
  champions: [{ title: 'FBA Champion', champion: 'San Antonio Spirits', runnerUp: 'Montreal Chevaliers', score: '4–0', teamId: 'SAS', runnerUpId: 'MON' }],
  standings: [
    { teamId: 'SAS', name: 'San Antonio Spirits', group: 'West', rank: 1, w: 60, l: 22, confW: null, confL: null, diff: null, marker: null, seed: 1, playoff: { round: 4, champion: true } },
    { teamId: 'MON', name: 'Montreal Chevaliers', group: 'East', rank: 2, w: 40, l: 42, confW: null, confL: null, diff: null, marker: null, seed: null, playoff: null },
  ],
} as SummaryFile;
const hallOfFame: HallOfFameFile = {
  league: 'fba', nominees: [], removed: [],
  classes: [{ season: 'S30', inductees: [{ name: 'Old Timer', playerId: null, retiredSeason: 'S29', lines: ['MON: S8-S23', 'USA/OAK: S24-S26', '3x Conference Champion'] }] }],
};
const input: TrophyInput = { summaries: [s79, s20, s60], teams, franchises, hallOfFame };

describe('trophyCase', () => {
  it('derives the San Antonio case', () => {
    expect(trophyCase('SAS', input)).toEqual({
      championships: [20, 79], finals: [20, 79], confTitles: [20, 79], tournaments: [60, 79],
      awards: [{ award: 'MVP', playerId: 'p00001', season: 20 }],
      hallOfFamers: [{ name: 'Old Timer', playerId: null, season: 'S30' }],
    });
  });
  it('derives the Montreal case', () => {
    const c = trophyCase('MON', input);
    expect(c.finals).toEqual([20, 79]);
    expect(c.championships).toEqual([]);
    expect(c.confTitles).toEqual([20]);
    expect(c.tournaments).toEqual([60]);
    expect(c.hallOfFamers).toHaveLength(1);
  });
  it('counts an award whose team id is a current id with no era match', () => {
    const s = { ...s20, awards: [{ award: 'MVP', playerId: 'p00003', teamId: 'MON' }] } as SummaryFile;
    expect(trophyCase('MON', { ...input, summaries: [s] }).awards).toEqual([{ award: 'MVP', playerId: 'p00003', season: 20 }]);
  });
});
