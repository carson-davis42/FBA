import { describe, expect, it } from 'vitest';
import { isMajor, selectMarchMadness } from './field';

const CODES = ['B12', 'ACC', 'BE', 'SEC', 'B10', 'AAC', 'P12', 'A10', 'MWC', 'PAT', 'COL', 'HOR', 'IVY', 'SOCON', 'SUN', 'SKY', 'OVC', 'NEC'];
const ranking = Array.from({ length: 216 }, (_, i) => `t${String(i).padStart(3, '0')}`);
const confOf = (id: string): string => CODES[Number(id.slice(1)) % 18];
const at = (...idx: number[]): string[] => idx.map(i => ranking[i]);
const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);

describe('selectMarchMadness', () => {
  it('guarantees the champions of the nine major conferences even when they rank last, and skips major at-larges from slot 51', () => {
    // The 18 champions are the lowest-ranked team of each conference (ranks 198-215; ranks 198-206 are major conferences).
    const champions = at(...range(198, 216));
    const { field } = selectMarchMadness(ranking, champions, confOf);
    expect(field).toHaveLength(64);
    expect(new Set(field).size).toBe(64);
    expect(field.slice(0, 43)).toEqual(at(...range(0, 43)));
    expect(field.slice(43, 52)).toEqual(at(...range(198, 207)));
    expect(field.slice(52, 55)).toEqual(at(45, 46, 47));
    expect(field.slice(55)).toEqual(at(...range(207, 216)));
    for (const c of champions) expect(field).toContain(c);
  });

  it('takes the best teams, then only non-major at-larges from slot 51, when every champion already ranks high', () => {
    const champions = at(...range(0, 18));
    const { field, leftover } = selectMarchMadness(ranking, champions, confOf);
    expect(field.slice(0, 51)).toEqual(at(...range(0, 51)));
    const nonMajor = ranking.slice(51).filter(t => !isMajor(confOf(t))).slice(0, 13);
    expect(field.slice(51)).toEqual(nonMajor);
    expect(leftover).toHaveLength(216 - 64);
    expect(leftover[0]).toBe(ranking[54]);
    for (const t of field) expect(leftover).not.toContain(t);
  });

  it('forces the nine major champions in from slot 43, then at-larges, then the remaining champions best first', () => {
    // Champions ranked 100-117: ranks 108-116 are the nine major-conference champions.
    const { field } = selectMarchMadness(ranking, at(...range(100, 118)), confOf);
    expect(field).toEqual(at(...range(0, 43), ...range(108, 117), 45, 46, 47, ...range(100, 108), 117));
  });

  it('is a permutation split: field plus leftover is every team once', () => {
    const { field, leftover } = selectMarchMadness(ranking, at(...range(150, 168)), confOf);
    expect([...field, ...leftover].sort()).toEqual([...ranking].sort());
  });
});
