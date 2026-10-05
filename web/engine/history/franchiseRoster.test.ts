import { describe, expect, it } from 'vitest';
import type { Franchise, PlayersFile, RostersFile } from '../shared/types';
import { franchiseIndex, franchiseSeasons, seasonRanges } from './franchiseRoster';

const franchise: Franchise = {
  teamId: 'MON',
  eras: [
    { name: 'Montreal', abbr: 'MON', city: 'Montreal', from: 12, to: null },
    { name: 'Florida Panthers', abbr: 'FLO', city: 'Orlando', from: 11, to: 11 },
    { name: 'Texas Outlaws', abbr: 'TEX', city: 'Dallas', from: 1, to: 10 },
  ],
};
const names: Record<string, string> = { p00001: 'Ann Able', p00002: 'Bo Baker', p00003: 'Cy Cole', p00004: 'Di Dunn', p00005: 'Ed Eze', p00006: 'Flo Fox', p00007: 'Gus Gray', p00008: 'Hal Hart' };
const players: PlayersFile = { nextId: 9, players: Object.fromEntries(Object.entries(names).map(([id, name]) => [id, { id, name, birthSeason: 40 }])) };
const bio = (playerId: string, ...entries: string[]) => ({ playerId, born: 'Born-S40', entries });
const bios = {
  league: 'fba' as const,
  bios: [
    bio('p00001', 'TEX-S5-S10', 'S7 MVP', '2x Young-Star', 'MON-S12-S13;S20-S21'),
    bio('p00002', 'BOS/MON-S20'),
    bio('p00003', 'BOS-S20-S25'),
    bio('p00004', 'FLO-S11'),
    bio('p00005', 'Duke-S1-S2'),
    bio('p00007', 'MON-S77-pres.', 'HOF-S90'),
  ],
};
const roster = (season: number, ids: string[]): RostersFile => ({
  league: 'fba', season, locked: false,
  teams: { MON: ids.map((playerId, i) => ({ playerId, position: 'PG' as const, rating: 60 + i, age: 25, points: 100 })) },
});
const build = (rosters: RostersFile[] = []) => franchiseIndex({ franchise, players, bios, summaries: [], hof: null, rosters });

describe('franchiseIndex', () => {
  it('matches stints to the franchise by era abbreviation, slash codes and multi-part ranges', () => {
    const { players: rows } = build();
    const seasons = (id: string) => rows.find(r => r.playerId === id)?.seasons;
    expect(seasons('p00001')).toEqual([5, 6, 7, 8, 9, 10, 12, 13, 20, 21]);
    expect(seasons('p00002')).toEqual([20]);
    expect(seasons('p00003')).toBeUndefined();
    expect(seasons('p00004')).toEqual([11]);
    expect(seasons('p00005')).toBeUndefined();
    expect(seasons('p00007')).toEqual([77, 78]);
  });

  it('keeps count-only honours on the player and exact-season honours on their season', () => {
    const idx = build();
    const ann = idx.players.find(r => r.playerId === 'p00001')!;
    expect(ann.honours).toEqual([{ label: 'MVP', count: 1, seasons: [7] }, { label: 'Young-Star', count: 2, seasons: [] }]);
    expect(idx.rosterFor(7).find(r => r.playerId === 'p00001')?.honours).toEqual(['MVP']);
    expect(idx.rosterFor(8).find(r => r.playerId === 'p00001')?.honours).toEqual([]);
    expect(idx.players.find(r => r.playerId === 'p00007')?.hof).toBe('S90');
  });

  it('adds roster-file players, with their slot, even when they have no bio', () => {
    const idx = build([roster(78, ['p00006', 'p00007'])]);
    expect(idx.players.find(r => r.playerId === 'p00006')?.seasons).toEqual([78]);
    const rows = idx.rosterFor(78);
    expect(rows.map(r => r.playerId)).toEqual(['p00007', 'p00006']);
    expect(rows[0].slot?.rating).toBe(61);
    expect(idx.rosterFor(77).every(r => r.slot === null)).toBe(true);
  });

  it('sorts players by first season, then name', () => {
    expect(build().players.map(r => r.playerId)).toEqual(['p00001', 'p00004', 'p00002', 'p00007']);
  });
});

describe('franchiseSeasons / seasonRanges', () => {
  it('lists every season of every era up to the latest', () => {
    expect(franchiseSeasons(franchise, 14)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
  it('writes runs as ranges', () => {
    expect(seasonRanges([12, 13, 14, 22])).toBe('S12–S14, S22');
    expect(seasonRanges([5])).toBe('S5');
    expect(seasonRanges([])).toBe('');
  });
});
