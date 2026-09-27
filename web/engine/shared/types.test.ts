import { describe, expect, it } from 'vitest';
import { FreeAgentsFile, LogoManifest, MetaFile, PickObligation, PicksFile, ResultsFile, RostersFile, ReservesFile, TransactionsFile } from './types';

describe('schemas', () => {
  it('accepts a valid roster document', () => {
    const doc = {
      league: 'fba', season: 79, locked: false,
      teams: { BOS: [{ playerId: 'p00001', position: 'PG', rating: 95, age: 28, points: 0, contractEnd: 80, contractAmount: 8 }] },
    };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('accepts a vacant roster slot', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { CAR: [{ playerId: null, position: 'C', rating: null, age: null, points: 0 }] } };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('rejects an unknown position', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { BOS: [{ playerId: 'p00001', position: 'G', rating: 95, age: 28, points: 0 }] } };
    expect(RostersFile.safeParse(doc).success).toBe(false);
  });

  it('requires every league in meta', () => {
    const doc = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };
    expect(MetaFile.safeParse(doc).success).toBe(false);
  });

  it('rejects a roster entry with an unknown key', () => {
    const doc = {
      league: 'fba', season: 79, locked: false,
      teams: { BOS: [{ playerId: 'p00001', position: 'PG', rating: 95, age: 28, points: 0, bogus: 1 }] },
    };
    expect(RostersFile.safeParse(doc).success).toBe(false);
  });

  it('rejects a game result with an unknown key', () => {
    const doc = { league: 'fba', season: 79, locked: false, games: [{ gameNo: 1, home: 'BOS', away: 'CAR', homePts: 100, awayPts: 90, ot: 0 }] };
    expect(ResultsFile.safeParse(doc).success).toBe(false);
  });

  it('rejects logo manifest entries that are paths', () => {
    expect(LogoManifest.safeParse({ folders: { x: [{ file: '../../etc/passwd.png', from: null, to: null, variant: 1 }] } }).success).toBe(false);
    expect(LogoManifest.safeParse({ folders: { '../x': [] } }).success).toBe(false);
    expect(LogoManifest.safeParse({ folders: { 'Boston Bucks': [{ file: 'Boston Bucks S61-pres..png', from: 61, to: null, variant: 0 }] } }).success).toBe(true);
  });
});

describe('roster-move schemas', () => {
  it('accepts a restricted roster entry', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { ATL: [{ playerId: 'p00004', position: 'PF', rating: 75, age: 20, points: 0, contractEnd: 79, contractAmount: 2, restricted: true }] } };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('validates free agents and reserves', () => {
    expect(FreeAgentsFile.safeParse({ league: 'fba', season: 79, locked: false, players: [{ playerId: 'p01000', position: 'C', age: 22, rating: null, rookie: true, note: 'R' }] }).success).toBe(true);
    expect(FreeAgentsFile.safeParse({ league: 'fbad2', season: 79, locked: false, players: [] }).success).toBe(false);
    expect(ReservesFile.safeParse({ league: 'fbad2', season: 79, locked: false, players: [{ playerId: 'p01001', position: 'PG', age: 30, rating: null }] }).success).toBe(true);
  });

  it('validates pick obligations and their conditions', () => {
    const ob = {
      id: 'imp-S80-DCB-1', season: 80, originalTeam: 'DCB', owner: 'OV',
      condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' },
      originSeason: 75, priority: 1, rolls: [], note: '',
    };
    expect(PickObligation.safeParse(ob).success).toBe(true);
    expect(PickObligation.safeParse({ ...ob, condition: { kind: 'top', n: 0 } }).success).toBe(false);
    expect(PickObligation.safeParse({ ...ob, condition: { kind: 'swap', otherTeam: 'SAS', betterTo: 'DCB' } }).success).toBe(true);
    expect(PicksFile.safeParse({ league: 'fba', obligations: [ob] }).success).toBe(true);
  });

  it('validates transactions', () => {
    const tx = { league: 'fba', season: 79, entries: [{ seq: 1, batchId: 'b1', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }] };
    expect(TransactionsFile.safeParse(tx).success).toBe(true);
    expect(TransactionsFile.safeParse({ ...tx, entries: [{ ...tx.entries[0], type: 'waived' }] }).success).toBe(false);
  });
});
