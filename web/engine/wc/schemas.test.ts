import { describe, expect, it } from 'vitest';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import { QualifyingFile, WorldCupFile } from '../shared/types';

const ids = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `T${a + i}`);
const qualifying = () => ({
  league: 'fbawc' as const, season: 79, host: 'T1',
  auto: ids(1, 15), field: ids(16, 85), schedule: [], keys: {}, games: [], advanced: [] as string[],
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
});
