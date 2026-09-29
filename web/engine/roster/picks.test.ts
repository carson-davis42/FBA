import { describe, expect, it } from 'vitest';
import type { PickCondition, PickObligation } from '../shared/types';
import { futureSeasons, isProtected, LOTTERY_SIZE, nextPriority, pickLabel, resolvePicks, shrink } from './picks';

const ob = (over: Partial<PickObligation>): PickObligation => ({
  id: 'x', season: 80, originalTeam: 'DCB', owner: 'OV', condition: { kind: 'none' }, originalCondition: { kind: 'none' },
  originSeason: 80, priority: 1, rolls: [], note: '', ...over,
});

// DCB's S80 pick is owed to OV (top 9, priority 1, originally LP from S75) and NY (top 11, priority 2, originally 12P from S79).
const dcb = (): PickObligation[] => [
  ob({ id: 'ov', owner: 'OV', condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, originSeason: 75, priority: 1 }),
  ob({ id: 'ny', owner: 'NY', condition: { kind: 'top', n: 11 }, originalCondition: { kind: 'top', n: 12 }, originSeason: 79, priority: 2 }),
];
const orderWithDcbAt = (slot: number) => {
  const others = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15'];
  const order = others.slice(0, slot - 1);
  order.push('DCB', ...others.slice(slot - 1));
  return order;
};

describe('labels and conditions', () => {
  it('formats pick labels like the sheet', () => {
    expect(pickLabel(ob({ season: 81, originalTeam: 'MON', owner: 'CGG', condition: { kind: 'top', n: 4 } }))).toBe('S81 Draft Pick(via MON)(4P)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'LA', condition: { kind: 'lottery' } }))).toBe('S81 Draft Pick(via LA)(LP)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'SAS', condition: { kind: 'none' } }))).toBe('S81 Draft Pick(via SAS)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'DCB', condition: { kind: 'swap', otherTeam: 'SAS', betterTo: 'DCB' } }))).toBe('S81 Pick Swap(DCB/SAS)(DCB gets better)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'NY', condition: { kind: 'custom', text: 'if NY makes finals' } }))).toBe('S81 Draft Pick(via NY)(if NY makes finals)');
  });

  it('checks protection by slot', () => {
    expect(isProtected({ kind: 'top', n: 9 }, 9, LOTTERY_SIZE)).toBe(true);
    expect(isProtected({ kind: 'top', n: 9 }, 10, LOTTERY_SIZE)).toBe(false);
    expect(isProtected({ kind: 'lottery' }, 14, LOTTERY_SIZE)).toBe(true);
    expect(isProtected({ kind: 'lottery' }, 15, LOTTERY_SIZE)).toBe(false);
    expect(isProtected({ kind: 'none' }, 1, LOTTERY_SIZE)).toBe(false);
  });

  it('shrinks protection by one spot per roll', () => {
    const cases: [PickCondition, PickCondition][] = [
      [{ kind: 'lottery' }, { kind: 'top', n: 13 }],
      [{ kind: 'top', n: 9 }, { kind: 'top', n: 8 }],
      [{ kind: 'top', n: 1 }, { kind: 'none' }],
      [{ kind: 'none' }, { kind: 'none' }],
    ];
    for (const [from, to] of cases) expect(shrink(from, LOTTERY_SIZE)).toEqual(to);
  });

  it('lists future seasons and next priority', () => {
    expect(futureSeasons(79)).toEqual([80, 81, 82, 83]);
    expect(nextPriority(dcb(), 80, 'DCB')).toBe(3);
    expect(nextPriority(dcb(), 81, 'DCB')).toBe(1);
  });
});

describe('resolvePicks', () => {
  it('keeps a protected pick and rolls both obligations with smaller protection', () => {
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(5), lotterySize: LOTTERY_SIZE, obligations: dcb() });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toEqual({ slot: 5, originalTeam: 'DCB', owner: 'DCB', obligationId: null, flag: null });
    expect(r.obligations.map(o => [o.id, o.season, o.condition, o.priority, o.rolls])).toEqual([
      ['ov', 81, { kind: 'top', n: 8 }, 1, [{ fromSeason: 80, reason: 'protected' }]],
      ['ny', 81, { kind: 'top', n: 10 }, 2, [{ fromSeason: 80, reason: 'protected' }]],
    ]);
  });

  it('conveys to the first unprotected obligation and rolls the rest as already owed', () => {
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(12), lotterySize: LOTTERY_SIZE, obligations: dcb() });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toMatchObject({ owner: 'OV', obligationId: 'ov' });
    expect(r.obligations).toHaveLength(1);
    expect(r.obligations[0]).toMatchObject({ id: 'ny', season: 81, condition: { kind: 'top', n: 10 }, rolls: [{ fromSeason: 80, reason: 'already-owed' }] });
  });

  it('skips a protected first obligation and conveys to the next one', () => {
    const obligations = [ob({ id: 'a', owner: 'OV', condition: { kind: 'top', n: 12 }, priority: 1 }), ob({ id: 'b', owner: 'NY', condition: { kind: 'top', n: 9 }, priority: 2 })];
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(10), lotterySize: LOTTERY_SIZE, obligations });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toMatchObject({ owner: 'NY', obligationId: 'b' });
    expect(r.obligations[0]).toMatchObject({ id: 'a', season: 81, condition: { kind: 'top', n: 11 }, rolls: [{ fromSeason: 80, reason: 'protected' }] });
  });

  it('turns lottery protection into top 13 when it rolls', () => {
    const r = resolvePicks({ season: 81, order: orderWithDcbAt(3), lotterySize: LOTTERY_SIZE, obligations: [ob({ season: 81, condition: { kind: 'lottery' } })] });
    expect(r.obligations[0]).toMatchObject({ season: 82, condition: { kind: 'top', n: 13 } });
  });

  it('queues rolled obligations after ones already owed next season', () => {
    const obligations = [...dcb(), ob({ id: 'next', season: 81, owner: 'MEM', priority: 1 })];
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(5), lotterySize: LOTTERY_SIZE, obligations });
    expect(r.obligations.filter(o => o.season === 81).map(o => [o.id, o.priority])).toEqual([['next', 1], ['ov', 2], ['ny', 3]]);
  });

  it('gives the better pick of a swap to the named team', () => {
    const swap = ob({ id: 's', originalTeam: 'DCB', owner: 'SAS', condition: { kind: 'swap', otherTeam: 'SAS', betterTo: 'SAS' } });
    const r = resolvePicks({ season: 80, order: ['DCB', 'X', 'SAS'], lotterySize: LOTTERY_SIZE, obligations: [swap] });
    expect(r.picks.map(p => [p.slot, p.originalTeam, p.owner])).toEqual([[1, 'DCB', 'SAS'], [2, 'X', 'X'], [3, 'SAS', 'DCB']]);
    expect(r.obligations).toEqual([]);
  });

  it('flags custom conditions and leaves them unresolved', () => {
    const custom = ob({ id: 'c', condition: { kind: 'custom', text: 'if DCB wins the title' } });
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(4), lotterySize: LOTTERY_SIZE, obligations: [custom] });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toMatchObject({ owner: 'DCB', flag: 'Custom condition: decide manually' });
    expect(r.obligations).toEqual([custom]);
  });

  it('leaves other seasons untouched', () => {
    const later = ob({ id: 'later', season: 82 });
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(1), lotterySize: LOTTERY_SIZE, obligations: [later] });
    expect(r.obligations).toEqual([later]);
  });

  it('throws when an obligation names a team that is not in the draft order', () => {
    expect(() => resolvePicks({ season: 80, order: orderWithDcbAt(1), lotterySize: LOTTERY_SIZE, obligations: [ob({ id: 'z', originalTeam: 'ZZZ' })] })).toThrow(/ZZZ/);
    const swap = ob({ id: 's', originalTeam: 'DCB', condition: { kind: 'swap', otherTeam: 'ZZZ', betterTo: 'DCB' } });
    expect(() => resolvePicks({ season: 80, order: orderWithDcbAt(1), lotterySize: LOTTERY_SIZE, obligations: [swap] })).toThrow(/ZZZ/);
  });
});
