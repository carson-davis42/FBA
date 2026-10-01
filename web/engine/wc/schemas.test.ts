import { describe, expect, it } from 'vitest';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import { KnockoutGame, QualifyingFile, WorldCupFile } from '../shared/types';

const ids = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `T${a + i}`);
const qualifying = () => ({
  league: 'fbawc' as const, season: 79, host: 'T1',
  auto: ids(1, 15), field: ids(16, 85), schedule: [], keys: Object.fromEntries(ids(1, 85).map((id, i) => [id, i / 100])), games: [], advanced: [] as string[],
});

describe('wc schema registry', () => {
  it('maps paths to schemas', () => {
    expect(schemaForPath('leagues/fbawc/S79/qualifying.json')).toBe(QualifyingFile);
    expect(schemaForPath('leagues/fbawc/S80/worldcup.json')).toBe(WorldCupFile);
    expect(schemaForPath('leagues/fba/S79/qualifying.json')).toBeNull();
  });
  it('flags a season mismatch', () => {
    expect(pathAgreementProblem('leagues/fbawc/S80/worldcup.json', { league: 'fbawc', season: 79 })).not.toBeNull();
  });
});

describe('QualifyingFile', () => {
  it('parses a valid minimal fixture', () => {
    expect(QualifyingFile.safeParse(qualifying()).success).toBe(true);
  });
  it('rejects an extra key', () => {
    expect(QualifyingFile.safeParse({ ...qualifying(), extra: 1 }).success).toBe(false);
  });
  it('rejects advanced of length 10', () => {
    expect(QualifyingFile.safeParse({ ...qualifying(), advanced: ids(16, 25) }).success).toBe(false);
  });
  it('rejects a team in both auto and field', () => {
    const q = qualifying();
    q.field[0] = 'T1';
    expect(QualifyingFile.safeParse(q).success).toBe(false);
  });
  it('rejects keys that miss a team', () => {
    const q = qualifying();
    delete (q.keys as Record<string, number>).T40;
    expect(QualifyingFile.safeParse(q).success).toBe(false);
  });
});

const worldCup = () => {
  const field = ids(1, 64);
  const groups = Object.fromEntries('ABCDEFGHIJKLMNOP'.split('').map((g, i) => [g, field.slice(i * 4, i * 4 + 4)]));
  return {
    league: 'fbawc' as const, season: 80, host: 'T1', field,
    pots: [0, 1, 2, 3].map(p => field.slice(p * 16, p * 16 + 16)), groups, keys: {}, schedule: [], groupGames: [],
    knockout: [] as unknown[], champion: null as string | null, runnerUp: null as string | null,
  };
};

describe('WorldCupFile', () => {
  it('parses a valid fixture', () => {
    expect(WorldCupFile.safeParse(worldCup()).success).toBe(true);
  });
  it('rejects an extra key', () => {
    expect(WorldCupFile.safeParse({ ...worldCup(), extra: 1 }).success).toBe(false);
  });
  it('requires champion and runnerUp to be both null or both set', () => {
    expect(WorldCupFile.safeParse({ ...worldCup(), champion: 'T1' }).success).toBe(false);
    expect(WorldCupFile.safeParse({ ...worldCup(), runnerUp: 'T2' }).success).toBe(false);
    expect(WorldCupFile.safeParse({ ...worldCup(), champion: 'T1', runnerUp: 'T2' }).success).toBe(true);
  });
});

describe('KnockoutGame', () => {
  it('rejects an extra key', () => {
    expect(KnockoutGame.safeParse({ id: 'F-1', round: 'F', home: null, away: null, game: null, extra: 1 }).success).toBe(false);
  });
});
