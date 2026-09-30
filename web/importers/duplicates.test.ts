import { describe, expect, it } from 'vitest';
import type { PlayersFile } from '../engine/shared/types';
import { mergeDuplicates } from './duplicates';
import { Report } from './report';
import type { BioRow } from './sheets/history';

const bio = (name: string, born: string): BioRow => ({ name, born, entries: [] });

const players = (): PlayersFile => ({
  nextId: 1914,
  players: {
    p00040: { id: 'p00040', name: 'Nadeem Akers', birthSeason: 50 },
    p00150: { id: 'p00150', name: 'Nadeem Akers', birthSeason: 56 },
    p00609: { id: 'p00609', name: "Jamari O'Neal", birthSeason: null },
    p01913: { id: 'p01913', name: 'Jamari O’Neal', birthSeason: 57 },
    p00001: { id: 'p00001', name: 'Solo Player', birthSeason: 60 },
  },
});

const entry = (playerId: string) => ({ playerId, position: 'PG', rating: 70, age: 25, points: 10 });
const roster = (league: string, ids: string[][]) => ({
  league, season: 78, locked: false, teams: Object.fromEntries(ids.map((t, i) => [`t${i}`, t.map(entry)])),
});
const bios = [bio('Nadeem Akers', 'Born-S50'), bio('Jamari O’Neal', 'Born-S57')];

describe('mergeDuplicates', () => {
  it('keeps the record born in the bio season and rewrites references', () => {
    const report = new Report();
    const docs = new Map<string, unknown>([
      ['players.json', players()],
      ['leagues/fba/S78/rosters.json', roster('fba', [['p00150', 'p00001']])],
    ]);
    const out = mergeDuplicates(docs, [bios[0]], report);
    const pf = out.get('players.json') as PlayersFile;
    expect(pf.players.p00040).toEqual({ id: 'p00040', name: 'Nadeem Akers', birthSeason: 50 });
    expect(pf.players.p00150).toBeUndefined();
    expect(JSON.stringify(out.get('leagues/fba/S78/rosters.json'))).toContain('p00040');
    expect(JSON.stringify(out.get('leagues/fba/S78/rosters.json'))).not.toContain('p00150');
    expect([...out.keys()].sort()).toEqual(['leagues/fba/S78/rosters.json', 'players.json']);
    expect(report.entries).toEqual([
      { level: 'info', topic: 'duplicates', message: 'Merged Nadeem Akers: p00150 → p00040 (1 references in 1 files)' },
      {
        level: 'warn', topic: 'duplicates',
        message: 'leagues/fba/S78/rosters.json: t0 Nadeem Akers (p00040) has age 25, but born S50 makes S78 age 28; re-run the roster import to fix it',
      },
    ]);
    expect(docs.get('players.json')).toEqual(players());
  });

  it('gives no age warning when the roster age matches the kept birth season', () => {
    const report = new Report();
    const r = roster('fba', [['p00150']]);
    r.teams.t0[0].age = 28;
    const docs = new Map<string, unknown>([['players.json', players()], ['leagues/fba/S78/rosters.json', r]]);
    mergeDuplicates(docs, [bios[0]], report);
    expect(report.entries.filter(e => e.level === 'warn')).toEqual([]);
  });

  it('keeps the record with a known birth season and uses the Players-tab spelling', () => {
    const report = new Report();
    const docs = new Map<string, unknown>([
      ['players.json', players()],
      ['leagues/fba/S78/freeAgents.json', {
        league: 'fba', season: 78, locked: false,
        players: [{ playerId: 'p00609', position: 'PG', age: 25, rating: 60, rookie: false, note: '' }],
      }],
      ['leagues/fbajc/S78/rosters.json', roster('fbajc', [['p00609']])],
    ]);
    const out = mergeDuplicates(docs, [bios[1]], report);
    const pf = out.get('players.json') as PlayersFile;
    expect(pf.players.p01913).toEqual({ id: 'p01913', name: 'Jamari O’Neal', birthSeason: 57 });
    expect(pf.players.p00609).toBeUndefined();
    expect(JSON.stringify(out.get('leagues/fba/S78/freeAgents.json'))).toContain('p01913');
    expect(JSON.stringify(out.get('leagues/fbajc/S78/rosters.json'))).toContain('p01913');
    expect(report.entries[0].message).toBe('Merged Jamari O’Neal: p00609 → p01913 (2 references in 2 files)');
  });

  it('falls back to the lowest id and fills null fields from the dropped record', () => {
    const pf: PlayersFile = {
      nextId: 9,
      players: {
        p00007: { id: 'p00007', name: 'Twin Guy', birthSeason: null },
        p00003: { id: 'p00003', name: 'Twin Guy', birthSeason: null, retired: { season: 70, league: 'fba', teamId: 'x', position: 'PG' } },
      },
    };
    const out = mergeDuplicates(new Map([['players.json', pf]]), [bio('Twin Guy', 'Born-FFL S1')], new Report());
    const merged = (out.get('players.json') as PlayersFile).players;
    expect(Object.keys(merged)).toEqual(['p00003']);
    expect(merged.p00003.retired?.season).toBe(70);
  });

  it('rewrites a player id used as an object key', () => {
    const docs = new Map<string, unknown>([
      ['players.json', players()],
      ['misc/counts.json', { byPlayer: { p00150: 3, p00001: 1 } }],
    ]);
    const out = mergeDuplicates(docs, [bios[0]], new Report());
    expect(out.get('misc/counts.json')).toEqual({ byPlayer: { p00040: 3, p00001: 1 } });
  });

  it('merges nothing when two bio rows share the name', () => {
    const out = mergeDuplicates(new Map([['players.json', players()]]), [bios[0], bio('Nadeem Akers', 'Born-S56')], new Report());
    expect(out.size).toBe(0);
  });

  it('errors and returns nothing when both records are on one roster', () => {
    const report = new Report();
    const docs = new Map<string, unknown>([
      ['players.json', players()],
      ['leagues/fba/S78/rosters.json', roster('fba', [['p00040', 'p00150']])],
    ]);
    expect(mergeDuplicates(docs, [bios[0]], report).size).toBe(0);
    expect(report.hasErrors).toBe(true);
    expect(report.entries[0]).toMatchObject({ level: 'error', topic: 'duplicates' });
    expect(report.entries[0].message).toContain('leagues/fba/S78/rosters.json');
  });

  it('errors when a rewritten doc fails its schema', () => {
    const report = new Report();
    const docs = new Map<string, unknown>([
      ['players.json', players()],
      ['leagues/fba/playerBios.json', {
        league: 'fba',
        bios: [{ playerId: 'p00040', born: 'Born-S50', entries: [] }, { playerId: 'p00150', born: 'Born-S56', entries: [] }],
      }],
    ]);
    expect(mergeDuplicates(docs, [bios[0]], report).size).toBe(0);
    expect(report.entries[0].message).toBe('leagues/fba/playerBios.json: Each player has one bio');
  });

  it('is idempotent: a second run over the merged docs changes nothing', () => {
    const docs = new Map<string, unknown>([
      ['players.json', players()],
      ['leagues/fba/S78/rosters.json', roster('fba', [['p00150', 'p00609']])],
    ]);
    const first = mergeDuplicates(docs, bios, new Report());
    expect(first.size).toBe(2);
    const merged = new Map([...docs, ...first]);
    const report = new Report();
    expect(mergeDuplicates(merged, bios, report).size).toBe(0);
    expect(report.entries).toEqual([]);
  });
});
