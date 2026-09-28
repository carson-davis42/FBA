import { describe, expect, it, vi } from 'vitest';
import type { TeamRecord } from '../season/standings';
import { betterAcross, orderTeams } from './tiebreak';

const rec = (teamId: string, w: number, l: number, extra: Partial<TeamRecord> = {}): TeamRecord => ({
  teamId, group: 'E', w, l, confW: 0, confL: 0, pf: 0, pa: 0, h2h: new Map(), log: [], ...extra,
});
const ids = (r: { order: TeamRecord[] }) => r.order.map(t => t.teamId);
const noRanks = () => { throw new Error('ranks should not be needed'); };

describe('orderTeams', () => {
  it('orders by overall record, then fewer games played', () => {
    // B and C are both 3 games over .500, but C has played fewer games (the Java's second check).
    const r = orderTeams([rec('B', 9, 6), rec('A', 10, 5), rec('C', 8, 5)], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['A', 'C', 'B']);
    expect(r.notes).toEqual([]);
  });

  it('breaks a tie by conference record (FBA) with a note', () => {
    const r = orderTeams([rec('CAR', 50, 36, { confW: 30, confL: 26 }), rec('MAN', 50, 36, { confW: 37, confL: 19 })], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['MAN', 'CAR']);
    expect(r.notes).toEqual([{ teams: ['MAN', 'CAR'], text: 'MAN over CAR: conference record 37–19 vs 30–26' }]);
  });

  it('skips conference record when told to (D2, and the FBA Finals)', () => {
    const a = rec('A', 5, 5, { confW: 1, h2h: new Map([['B', 0]]) });
    const b = rec('B', 5, 5, { confW: 5, h2h: new Map([['A', 2]]) });
    expect(ids(orderTeams([a, b], { conference: false, ranks: noRanks }))).toEqual(['B', 'A']);
  });

  it('breaks a two-team tie by head-to-head', () => {
    const r = orderTeams([rec('DET', 55, 31, { h2h: new Map([['BOS', 1]]) }), rec('BOS', 55, 31, { h2h: new Map([['DET', 3]]) })], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['BOS', 'DET']);
    expect(r.notes[0].text).toBe('BOS over DET: head-to-head 3–1');
  });

  it('uses head-to-head among only the tied teams for a three-way tie', () => {
    const a = rec('A', 10, 10, { h2h: new Map([['B', 2], ['C', 1], ['Z', 5]]) });
    const b = rec('B', 10, 10, { h2h: new Map([['A', 0], ['C', 2]]) });
    const c = rec('C', 10, 10, { h2h: new Map([['A', 1], ['B', 0]]) });
    const r = orderTeams([c, b, a], { conference: false, ranks: noRanks });
    expect(ids(r)).toEqual(['A', 'B', 'C']);
    expect(r.notes[0].text).toBe('A, B, C: head-to-head 3–1, 2–2, 1–3');
  });

  it('restarts at head-to-head after a split', () => {
    // Everyone is 2–2 among the three, so head-to-head can't split them; point differential puts A first,
    // and then B and C restart at head-to-head, where B beat C twice.
    const a = rec('A', 10, 10, { pf: 150, pa: 100, h2h: new Map([['B', 2], ['C', 0]]) });
    const b = rec('B', 10, 10, { pf: 110, pa: 100, h2h: new Map([['A', 0], ['C', 2]]) });
    const c = rec('C', 10, 10, { pf: 110, pa: 100, h2h: new Map([['A', 2], ['B', 0]]) });
    const r = orderTeams([c, a, b], { conference: false, ranks: noRanks });
    expect(ids(r)).toEqual(['A', 'B', 'C']);
    expect(r.notes.map(n => n.text)).toEqual(['A, C, B: point differential +50, +10, +10', 'B over C: head-to-head 2–0']);
  });

  it('breaks a tie by point differential when head-to-head is even or unplayed', () => {
    const r = orderTeams([rec('A', 5, 5, { pf: 500, pa: 490 }), rec('B', 5, 5, { pf: 500, pa: 470 })], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['B', 'A']);
    expect(r.notes[0].text).toBe('B over A: point differential +30 vs +10');
  });

  it('falls back to the power rankings, asking for them only then', () => {
    const ranks = vi.fn(() => ['X', 'VEG', 'Y', 'MIL']);
    const r = orderTeams([rec('MIL', 23, 63), rec('VEG', 23, 63)], { conference: true, ranks });
    expect(ids(r)).toEqual(['VEG', 'MIL']);
    expect(r.notes[0].text).toBe('VEG over MIL: power ranking #2 vs #4');
    expect(ranks).toHaveBeenCalledTimes(1);
    const untied = vi.fn(() => []);
    orderTeams([rec('A', 2, 0), rec('B', 1, 1)], { conference: true, ranks: untied });
    expect(untied).not.toHaveBeenCalled();
  });

  it('puts unranked (winless) teams after ranked ones, then by id', () => {
    const r = orderTeams([rec('C', 0, 4), rec('B', 0, 4), rec('A', 0, 4)], { conference: true, ranks: () => ['C'] });
    expect(ids(r)).toEqual(['C', 'A', 'B']);
    expect(r.notes[0].text).toBe('C, A, B: power ranking #1, unranked, unranked');
  });
});

describe('betterAcross (FBA Finals home court)', () => {
  it('compares records, then head-to-head, ignoring conference record', () => {
    expect(betterAcross(rec('E1', 60, 26), rec('W1', 58, 28), noRanks)).toBe(true);
    const e = rec('E1', 60, 26, { confW: 50, h2h: new Map([['W1', 0]]) });
    const w = rec('W1', 60, 26, { group: 'W', confW: 10, h2h: new Map([['E1', 2]]) });
    expect(betterAcross(e, w, noRanks)).toBe(false);
    expect(betterAcross(w, e, noRanks)).toBe(true);
  });
});
