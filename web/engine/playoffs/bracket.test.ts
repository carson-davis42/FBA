import { describe, expect, it } from 'vitest';
import { advance, bracketColumns, buildBracket, FINALS, finalId, hostOf, roundName } from './bracket';
import type { PlayoffSeries } from '../shared/types';

const east = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'];
const west = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
const fba = () => buildBracket('fba', [{ group: 'E', teams: east }, { group: 'W', teams: west }]);
const find = (b: { series: PlayoffSeries[] }, id: string) => b.series.find(s => s.id === id)!;
const never = () => { throw new Error('not the Finals'); };

describe('buildBracket', () => {
  it('pairs 1v8, 2v7, 3v6, 4v5 with fixed next slots and a Finals (FBA)', () => {
    const b = fba();
    expect(b.series).toHaveLength(15);
    expect(find(b, 'E-R1-1')).toMatchObject({ home: 'E1', away: 'E8', homeSeed: 1, awaySeed: 8, round: 1, next: 'E-SF-1' });
    expect(find(b, 'E-R1-4')).toMatchObject({ home: 'E4', away: 'E5', next: 'E-SF-1' });
    expect(find(b, 'E-R1-2')).toMatchObject({ home: 'E2', away: 'E7', next: 'E-SF-2' });
    expect(find(b, 'E-R1-3')).toMatchObject({ home: 'E3', away: 'E6', next: 'E-SF-2' });
    expect(find(b, 'E-SF-1')).toMatchObject({ round: 2, next: 'E-CF', home: null });
    expect(find(b, 'E-CF')).toMatchObject({ round: 3, next: FINALS });
    expect(find(b, FINALS)).toMatchObject({ group: null, round: 4, next: null });
  });

  it('starts the Java rotation: E 1v8, W 1v8, E 2v7, W 2v7, …', () => {
    expect(fba().queue).toEqual(['E-R1-1', 'W-R1-1', 'E-R1-2', 'W-R1-2', 'E-R1-3', 'W-R1-3', 'E-R1-4', 'W-R1-4']);
  });

  it('builds four D2 league brackets with no cross-league final', () => {
    const groups = ['PL', 'WL', 'UL', 'IL'].map(g => ({ group: g, teams: east.map(t => `${g}${t}`) }));
    const b = buildBracket('fbad2', groups);
    expect(b.series).toHaveLength(28);
    expect(find(b, 'PL-F')).toMatchObject({ round: 3, next: null });
    expect(b.queue.slice(0, 5)).toEqual(['PL-R1-1', 'WL-R1-1', 'UL-R1-1', 'IL-R1-1', 'PL-R1-2']);
    expect(finalId('fbad2', 'UL')).toBe('UL-F');
    expect(finalId('fba', 'W')).toBe('W-CF');
  });
});

describe('hostOf (2-2-1-1-1)', () => {
  it('gives the higher seed games 1, 2, 5, 7 and the other team games 3, 4, 6', () => {
    const s = find(fba(), 'E-R1-1');
    expect([1, 2, 3, 4, 5, 6, 7].map(n => hostOf(s, n).home)).toEqual(['E1', 'E1', 'E8', 'E8', 'E1', 'E8', 'E1']);
    expect(hostOf(s, 3).away).toBe('E1');
  });
});

describe('advance', () => {
  it('sends an unfinished series to the back of the queue', () => {
    const b = advance(fba(), 'E-R1-1', 'E8', never);
    expect(find(b, 'E-R1-1')).toMatchObject({ homeWins: 0, awayWins: 1, winner: null });
    expect(b.queue[0]).toBe('W-R1-1');
    expect(b.queue[b.queue.length - 1]).toBe('E-R1-1');
  });

  it('moves a winner on, gives the lower seed number home court, and queues the next series once both teams are known', () => {
    let b = fba();
    for (let k = 0; k < 4; k++) b = advance(b, 'E-R1-4', 'E5', never);
    expect(find(b, 'E-R1-4').winner).toBe('E5');
    expect(find(b, 'E-SF-1')).toMatchObject({ home: 'E5', homeSeed: 5, away: null });
    expect(b.queue).not.toContain('E-SF-1');
    for (let k = 0; k < 4; k++) b = advance(b, 'E-R1-1', 'E1', never);
    expect(find(b, 'E-SF-1')).toMatchObject({ home: 'E1', homeSeed: 1, away: 'E5', awaySeed: 5 });
    expect(b.queue[b.queue.length - 1]).toBe('E-SF-1');
  });

  it('decides Finals home court with `better`', () => {
    let b = fba();
    const win = (id: string, team: string) => { for (let k = 0; k < 4; k++) b = advance(b, id, team, (x, y) => x === 'W2' && y === 'E1'); };
    for (const g of ['E', 'W']) {
      win(`${g}-R1-1`, `${g}1`); win(`${g}-R1-4`, `${g}4`); win(`${g}-R1-2`, `${g}2`); win(`${g}-R1-3`, `${g}3`);
    }
    win('E-SF-1', 'E1'); win('E-SF-2', 'E2'); win('W-SF-1', 'W4'); win('W-SF-2', 'W2');
    win('E-CF', 'E1');
    win('W-CF', 'W2');
    expect(find(b, FINALS)).toMatchObject({ home: 'W2', away: 'E1' });
    expect(b.queue).toEqual([FINALS]);
  });
});

describe('labels and columns', () => {
  it('names rounds', () => {
    const b = fba();
    expect(roundName('fba', find(b, 'E-R1-2'))).toBe('East first round');
    expect(roundName('fba', find(b, 'W-CF'))).toBe('West conference finals');
    expect(roundName('fba', find(b, FINALS))).toBe('FBA Finals');
    const d2 = buildBracket('fbad2', [{ group: 'PL', teams: east }]);
    expect(roundName('fbad2', find(d2, 'PL-SF-1'))).toBe('Premier League semifinals');
    expect(roundName('fbad2', find(d2, 'PL-F'))).toBe('Premier League final');
  });
  it('lays a group out as columns that line up with the next round', () => {
    expect(bracketColumns('fba', 'E')).toEqual([['E-R1-1', 'E-R1-4', 'E-R1-2', 'E-R1-3'], ['E-SF-1', 'E-SF-2'], ['E-CF']]);
  });
});
