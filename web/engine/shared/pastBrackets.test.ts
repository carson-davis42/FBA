import { describe, expect, it } from 'vitest';
import { PastBracket, SummaryFile } from './types';

const side = (name: string, seed: number | null = 1) => ({ name, record: null, seed });
const final = (over: Record<string, unknown> = {}) => ({
  id: 'R1-1', round: 1, home: side('Rome'), away: side('Oslo', 2), homeWins: 1, awayWins: 0, winner: 'home', score: '97–75', ...over,
});
const bracket = (over: Record<string, unknown> = {}) => ({ rounds: 1, series: [final(over)] });
const summary = (league: string, extra: Record<string, unknown> = {}) => ({ league, season: 76, locked: true, host: null, champions: [], ...extra });

describe('PastSeries score', () => {
  it('accepts a scored final', () => {
    expect(PastBracket.safeParse(bracket()).success).toBe(true);
    expect(PastBracket.safeParse(bracket({ score: '97-75' })).success).toBe(true);
  });
  it('rejects wins other than 1-0 with a score', () => {
    expect(PastBracket.safeParse(bracket({ homeWins: 2, awayWins: 0 })).success).toBe(false);
    expect(PastBracket.safeParse(bracket({ homeWins: 1, awayWins: 1 })).success).toBe(false);
  });
  it('rejects a score whose first number is not larger', () => {
    expect(PastBracket.safeParse(bracket({ score: '75–97' })).success).toBe(false);
    expect(PastBracket.safeParse(bracket({ score: '80–80' })).success).toBe(false);
  });
  it('rejects a malformed score', () => {
    expect(PastBracket.safeParse(bracket({ score: 'abc' })).success).toBe(false);
  });
});

describe('SummaryFile pastBrackets', () => {
  const pb = (group: string) => ({ group, bracket: bracket() });
  it('accepts pastBrackets on a D2 summary', () => {
    expect(SummaryFile.safeParse(summary('fbad2', { pastBrackets: [pb('PL'), pb('WL')] })).success).toBe(true);
  });
  it('rejects pastBrackets on the FBA', () => {
    expect(SummaryFile.safeParse(summary('fba', { pastBrackets: [pb('PL')] })).success).toBe(false);
  });
  it('rejects a repeated group', () => {
    expect(SummaryFile.safeParse(summary('fbad2', { pastBrackets: [pb('PL'), pb('PL')] })).success).toBe(false);
  });
  it('rejects pastBracket together with pastBrackets', () => {
    expect(SummaryFile.safeParse(summary('fbad2', { pastBracket: bracket(), pastBrackets: [pb('PL')] })).success).toBe(false);
  });
  it('allows a null pastBracket beside pastBrackets', () => {
    expect(SummaryFile.safeParse(summary('fbad2', { pastBracket: null, pastBrackets: [pb('PL')] })).success).toBe(true);
  });
});

/** A full tree of `rounds` rounds; team T<n> wins every series for the lower slot. */
function fullTree(rounds: number) {
  const series: Record<string, unknown>[] = [];
  const slots = 2 ** rounds;
  for (let r = 1; r <= rounds; r++) {
    const n = 2 ** (rounds - r);
    const span = 2 ** r;
    for (let k = 1; k <= n; k++) {
      const lo = (k - 1) * span + 1;
      const hi = lo + span / 2;
      series.push({
        id: `R${r}-${k}`, round: r,
        home: { name: `T${lo}`, record: null, seed: null }, away: { name: `T${hi}`, record: null, seed: null },
        homeWins: 4, awayWins: 1, winner: 'home',
      });
    }
  }
  return { rounds, series, slots };
}

describe('PastBracket rounds cap', () => {
  it('accepts a 6-round, 64-slot bracket', () => {
    const { rounds, series } = fullTree(6);
    expect(series).toHaveLength(63);
    expect(PastBracket.safeParse({ rounds, series }).success).toBe(true);
  });
  it('rejects a 7-round bracket', () => {
    const { rounds, series } = fullTree(7);
    expect(PastBracket.safeParse({ rounds, series }).success).toBe(false);
  });
});
