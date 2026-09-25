import { describe, expect, it } from 'vitest';
import { LogoManifest, MetaFile, ResultsFile, RostersFile } from './types';

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
