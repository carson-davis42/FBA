import { describe, expect, it } from 'vitest';
import type { PlayersFile, ResultsFile, RostersFile } from '../shared/types';
import { schoolIndex } from './schoolRoster';

const players: PlayersFile = {
  nextId: 5,
  players: {
    p00001: { id: 'p00001', name: 'Ann Able', birthSeason: 40 },
    p00002: { id: 'p00002', name: 'Bo Baker', birthSeason: 40 },
    p00003: { id: 'p00003', name: 'Cy Cole', birthSeason: 40 },
    p00004: { id: 'p00004', name: 'Di Dunn', birthSeason: 40 },
  },
};
const bio = (playerId: string, ...entries: string[]) => ({ playerId, born: 'Born-S40', entries });
const bios = {
  league: 'fba' as const,
  bios: [
    bio('p00001', 'Oklahoma-S70-S72', 'S71 B12 POY', '2x B12 TOUR Champion', 'BOS-S73-pres.'),
    bio('p00002', 'Oklahoma State-S70', 'OAK-S71-S75'),
    bio('p00003', 'Wake Forest-S74', 'Oklahoma-S75-pres.'),
  ],
};
const rosters: RostersFile[] = [{
  league: 'fbajc', season: 78, locked: false,
  teams: { OU: [{ playerId: 'p00003', position: 'PG', rating: 80, age: 20, points: 500 }, { playerId: 'p00004', position: 'C', rating: 90, age: 19, points: 700 }] },
} as unknown as RostersFile];
const team = { teamId: 'OU', name: 'Oklahoma' };
const base = { team, players, bios, hof: null, rosters };

describe('schoolIndex', () => {
  it('lists the players whose bios place them at the school, by exact school name', () => {
    const { players: rows } = schoolIndex(base);
    expect(rows.map(r => r.name)).toEqual(['Ann Able', 'Cy Cole', 'Di Dunn']);
    expect(rows.find(r => r.name === 'Bo Baker')).toBeUndefined();
    expect(rows[0].seasons).toEqual([70, 71, 72]);
  });
  it('adds the seasons a player appears on a roster file, even without a bio', () => {
    const { players: rows } = schoolIndex(base);
    expect(rows.find(r => r.name === 'Cy Cole')!.seasons).toEqual([75, 76, 77, 78]);
    expect(rows.find(r => r.name === 'Di Dunn')!.seasons).toEqual([78]);
  });
  it('keeps the honours of the school stint with their seasons', () => {
    const ann = schoolIndex(base).players[0];
    expect(ann.honours.find(h => h.label === 'B12 POY')?.seasons).toEqual([71]);
    expect(ann.honours.find(h => h.label === 'B12 TOUR Champion')?.count).toBe(2);
  });
  it('rosterFor gives rated slots first and the honours dated that season', () => {
    const idx = schoolIndex(base);
    expect(idx.rosterFor(78).map(r => r.name)).toEqual(['Di Dunn', 'Cy Cole']);
    expect(idx.rosterFor(78)[0].slot?.rating).toBe(90);
    expect(idx.rosterFor(71)[0].honours).toEqual(['B12 POY']);
  });
  it('counts a player who played a game of the open season', () => {
    const results = { league: 'fbajc', season: 79, locked: false, games: [{ gameNo: 1, home: 'OU', away: 'KU', homePts: 1, awayPts: 0, box: { home: [{ playerId: 'p00002' }], away: [] } }] } as unknown as ResultsFile;
    const rows = schoolIndex({ ...base, results }).players;
    expect(rows.find(r => r.name === 'Bo Baker')?.seasons).toEqual([79]);
  });
  it('lists the seasons that have players', () => {
    expect(schoolIndex(base).seasons).toEqual([70, 71, 72, 75, 76, 77, 78]);
  });
});
