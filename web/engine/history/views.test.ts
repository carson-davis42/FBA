import { describe, expect, it } from 'vitest';
import type { PlayersFile, SummaryFile, SummaryPlayerLine } from '../shared/types';
import { awardRows, championshipRows, playerIndex, searchPlayers } from './views';
import { playerHonours, playerLines } from './honours';

const totals = { g: 0, pts: 0, def: 0, stops: 0, allowed: 0, exp: 0 };
const line = (playerId: string, teamId: string): SummaryPlayerLine => ({
  playerId, teamId, stint: 1, position: 'PG', ratingStart: 70, ratingEnd: 71, rs: { ...totals, g: 10 }, po: null,
});

const s48: SummaryFile = {
  league: 'fba', season: 48, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Boston', runnerUp: 'Utah', score: '4-2', finalsMvp: 'p00001' }],
  awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'BOS' }, { award: 'ROTY', playerId: 'p00002', teamId: 'UTA' }],
  allFba: {
    team1: [
      { slot: 'OUT', playerId: 'p00001', teamId: 'BOS' }, { slot: 'MID', playerId: 'p00003', teamId: 'UTA' },
      { slot: 'IN', playerId: 'p00004', teamId: null }, { slot: 'ANY', playerId: null, teamId: null },
    ],
    team2: [
      { slot: 'OUT', playerId: 'p00002', teamId: 'UTA' }, { slot: 'MID', playerId: null, teamId: null },
      { slot: 'IN', playerId: null, teamId: null }, { slot: 'ANY', playerId: null, teamId: null },
    ],
  },
  allStar: {
    allStars: ['p00001', 'p00003'], youngStars: ['p00002'], asgMvp: 'p00001', fivePoint: 'p00003', dunk: null, ysgMvp: 'p00002',
  },
  confChampions: { E: 'Boston', W: 'Utah' },
};

const s79: SummaryFile = {
  league: 'fba', season: 79, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion: 'Denver', runnerUp: 'Miami', score: '4-1', teamId: 'DEN', runnerUpId: 'MIA', finalsMvp: null }],
  awards: [{ award: 'MVP', playerId: 'p00003', teamId: 'DEN' }],
  standings: [
    { teamId: 'DEN', name: 'Denver Nuggets', group: 'West', rank: 1, w: 60, l: 22, confW: null, confL: null, diff: null, marker: null, seed: 1, playoff: { round: 4, champion: true } },
    { teamId: 'MIA', name: 'Miami Heat', group: 'East', rank: 1, w: 58, l: 24, confW: null, confL: null, diff: null, marker: null, seed: 1, playoff: { round: 4, champion: false } },
  ],
  bracket: {
    seeds: [],
    series: [
      { id: 'W-CF', group: 'West', round: 3, home: 'DEN', away: 'LAL', homeSeed: 1, awaySeed: 2, homeWins: 4, awayWins: 1, winner: 'DEN', next: 'FINALS' },
      { id: 'E-CF', group: 'East', round: 3, home: 'MIA', away: 'NYK', homeSeed: 1, awaySeed: 2, homeWins: 4, awayWins: 3, winner: 'MIA', next: 'FINALS' },
    ],
  },
  players: [line('p00003', 'DEN'), line('p00005', 'MIA')],
};

const noChampion: SummaryFile = {
  league: 'fba', season: 20, locked: true, host: null, champions: [{ title: 'D2 Champion', champion: 'X', runnerUp: null, score: null }],
};

const seasons = [s48, noChampion, s79];
const players: PlayersFile = {
  nextId: 7,
  players: {
    p00001: { id: 'p00001', name: 'Ann Star', birthSeason: null },
    p00002: { id: 'p00002', name: 'Bo Young', birthSeason: null },
    p00003: { id: 'p00003', name: 'Cameron Lučić', birthSeason: null },
    p00004: { id: 'p00004', name: null, birthSeason: null },
    p00005: { id: 'p00005', name: 'Dee Role', birthSeason: null },
    p00006: { id: 'p00006', name: 'Unused Person', birthSeason: null },
  },
};

describe('championshipRows', () => {
  it('lists FBA champions newest first, skipping seasons without one', () => {
    const rows = championshipRows(seasons);
    expect(rows.map(r => r.season)).toEqual([79, 48]);
    expect(rows[1]).toEqual({ season: 48, champion: 'Boston', runnerUp: 'Utah', score: '4–2', finalsMvp: 'p00001', west: 'Utah', east: 'Boston' });
  });
  it('derives the conference champions from the bracket, named through the standings', () => {
    expect(championshipRows(seasons)[0]).toEqual({ season: 79, champion: 'Denver', runnerUp: 'Miami', score: '4–1', finalsMvp: null, west: 'Denver Nuggets', east: 'Miami Heat' });
  });
  it('falls back to the team id, and to null without a bracket', () => {
    const bare: SummaryFile = { ...s79, standings: undefined };
    expect(championshipRows([bare])[0]).toMatchObject({ west: 'DEN', east: 'MIA' });
    const none: SummaryFile = { ...s79, standings: undefined, bracket: undefined };
    expect(championshipRows([none])[0]).toMatchObject({ west: null, east: null });
  });
});

describe('awardRows', () => {
  it('lists the winners newest first', () => {
    expect(awardRows(seasons)).toEqual([
      { season: 79, winners: { MVP: { playerId: 'p00003', teamId: 'DEN' } } },
      { season: 48, winners: { MVP: { playerId: 'p00001', teamId: 'BOS' }, ROTY: { playerId: 'p00002', teamId: 'UTA' } } },
    ]);
  });
});

describe('playerIndex and searchPlayers', () => {
  const bios = { league: 'fba' as const, bios: [{ playerId: 'p00006', born: '1990', entries: ['x'] }] };
  const index = playerIndex(seasons, bios, players);
  it('collects every named player, sorted by name, skipping ids with no name', () => {
    expect(index.map(p => p.name)).toEqual(['Ann Star', 'Bo Young', 'Cameron Lučić', 'Dee Role', 'Unused Person']);
    expect(playerIndex(seasons, null, players).map(p => p.playerId)).not.toContain('p00006');
  });
  it('searches a normalised substring', () => {
    expect(searchPlayers(index, 'lucic').map(p => p.name)).toEqual(['Cameron Lučić']);
    expect(searchPlayers(index, '  ANN ').map(p => p.playerId)).toEqual(['p00001']);
    expect(searchPlayers(index, '')).toHaveLength(5);
  });
});

describe('playerHonours and playerLines', () => {
  it('lists honours by season ascending, in the fixed order within a season', () => {
    expect(playerHonours(seasons, 'p00001')).toEqual([
      { season: 48, text: 'Finals MVP' },
      { season: 48, text: 'MVP' },
      { season: 48, text: 'All-FBA Team 1 (OUT)' },
      { season: 48, text: 'All-Star' },
      { season: 48, text: 'All-Star Game MVP' },
    ]);
    expect(playerHonours(seasons, 'p00002')).toEqual([
      { season: 48, text: 'ROTY' },
      { season: 48, text: 'All-FBA Team 2 (OUT)' },
      { season: 48, text: 'Young-Star' },
      { season: 48, text: 'Young-Star MVP' },
    ]);
    expect(playerHonours(seasons, 'p00003').map(h => h.text)).toEqual(['All-FBA Team 1 (MID)', 'All-Star', '5-point contest winner', 'MVP']);
    expect(playerHonours(seasons, 'p00003').map(h => h.season)).toEqual([48, 48, 48, 79]);
  });
  it('returns the season lines for a player', () => {
    expect(playerLines(seasons, 'p00003')).toEqual([{ season: 79, line: s79.players![0] }]);
    expect(playerLines(seasons, 'p00001')).toEqual([]);
  });
});
