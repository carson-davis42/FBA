import { describe, expect, it } from 'vitest';
import { playerRows } from './playerRows';
import type { PlayersFile, ResultsFile, RostersFile } from './types';

const e = (playerId: string | null, extra: Record<string, unknown> = {}) => ({ playerId, position: 'PG' as const, rating: 80, age: 25, points: 0, ...extra });
const rosters: RostersFile = { league: 'fba', season: 79, locked: false, teams: {
  BOS: [e('p00001', { contractAmount: 8, contractEnd: 81 }), e(null)],
  MEM: [e('p00002', { contractAmount: 5, contractEnd: 80 }), e('p00003')],
} };
const players: PlayersFile = { nextId: 4, players: {
  p00001: { id: 'p00001', name: 'Ann', birthSeason: 50 },
  p00002: { id: 'p00002', name: 'Bob', birthSeason: 51 },
  p00003: { id: 'p00003', name: null, birthSeason: 52 },
} };
const line = (playerId: string, pts: number) => ({ playerId, pts });
const results: ResultsFile = { league: 'fba', season: 79, locked: false, games: [
  { gameNo: 1, home: 'BOS', away: 'MEM', homePts: 10, awayPts: 7, box: { home: [line('p00001', 10)], away: [line('p00002', 7)] } },
  // p00002 changed teams: he appears for BOS here
  { gameNo: 2, home: 'BOS', away: 'MEM', homePts: 9, awayPts: 4, box: { home: [line('p00001', 5), line('p00002', 4)], away: [line('p00003', 0)] } },
  { gameNo: 3, home: 'BOS', away: 'MEM', homePts: 1, awayPts: 1 },
] };

describe('playerRows', () => {
  it('counts games and points from box appearances, whatever the team', () => {
    const rows = playerRows({ league: 'fba', rosters, results, players });
    const by = Object.fromEntries(rows.map(r => [r.playerId, r]));
    expect(by.p00001).toMatchObject({ gp: 2, pts: 15, ppg: 7.5, teamId: 'BOS' });
    expect(by.p00002).toMatchObject({ gp: 2, pts: 11, ppg: 5.5, teamId: 'MEM' });
  });
  it('skips vacant slots, gives null PPG without games and "Unnamed" without a name', () => {
    const rows = playerRows({ league: 'fba', rosters, results: null, players });
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.gp === 0 && r.ppg === null)).toBe(true);
    expect(rows.find(r => r.playerId === 'p00003')!.name).toBe('Unnamed');
  });
  it('keeps contract fields for the FBA only', () => {
    expect(playerRows({ league: 'fba', rosters, results, players })[0]).toMatchObject({ contractAmount: 8, contractEnd: 81 });
    expect(playerRows({ league: 'fbad2', rosters, results, players })[0]).toMatchObject({ contractAmount: null, contractEnd: null });
  });
  it('counts a repeated player once', () => {
    const dup: RostersFile = { ...rosters, teams: { BOS: [e('p00001')], MEM: [e('p00001')] } };
    const rows = playerRows({ league: 'fba', rosters: dup, results, players });
    expect(rows).toHaveLength(1);
    expect(rows[0].teamId).toBe('BOS');
  });
});
