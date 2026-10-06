import { describe, expect, it } from 'vitest';
import type { RosterEntry } from '../shared/types';
import { baseState } from './testFixtures';
import { assessTrade, pickValue, playerValue, teamRanks } from './tradeValue';

const entry = (rating: number | null, age: number | null, contractEnd: number | null, contractAmount: number | null): RosterEntry =>
  ({ playerId: 'p99999', position: 'PG', rating, age, points: 0, contractEnd, contractAmount });

describe('playerValue', () => {
  it('rises steeply with rating', () => {
    expect(playerValue(entry(85, 25, 81, 6), 79)).toBeGreaterThan(playerValue(entry(75, 25, 81, 5), 79) * 1.5);
    expect(playerValue(entry(75, 25, 81, 5), 79)).toBeGreaterThan(playerValue(entry(67, 25, 81, 2), 79));
  });
  it('prefers youth: the same player is worth less near the retirement age', () => {
    expect(playerValue(entry(80, 23, 81, 5), 79)).toBeGreaterThan(playerValue(entry(80, 31, 81, 5), 79));
  });
  it('prefers a cheap contract that runs longer over an expensive or expiring one', () => {
    const cheap = playerValue(entry(80, 25, 81, 3), 79);
    expect(cheap).toBeGreaterThan(playerValue(entry(80, 25, 81, 8), 79));
    expect(cheap).toBeGreaterThan(playerValue(entry(80, 25, 79, 3), 79));
  });
  it('is zero without a rating and still counts a player with no contract or age', () => {
    expect(playerValue(entry(null, 25, 81, 3), 79)).toBe(0);
    expect(playerValue(entry(80, null, null, null), 79)).toBeGreaterThan(0);
  });
});

describe('pickValue', () => {
  // A 30-team league where T01 is the weakest and T30 the strongest.
  const ranks = new Map(Array.from({ length: 30 }, (_, i) => [`T${String(i + 1).padStart(2, '0')}`, i + 1] as const));
  const none = { kind: 'none' } as const;
  it('ranks teams by average rating, weakest first', () => {
    const r = teamRanks(baseState().fba);
    expect(r.get('MON')).toBe(1); // 74.5 average
    expect(r.get('BOS')).toBe(2); // 82.4
    expect(r.get('CAR')).toBe(3); // 82.75
  });
  it('is worth more from a weak team than a strong one, and less when protected', () => {
    expect(pickValue('T01', 80, none, 79, ranks)).toBeGreaterThan(pickValue('T30', 80, none, 79, ranks));
    expect(pickValue('T03', 80, { kind: 'top', n: 5 }, 79, ranks)).toBeLessThan(pickValue('T03', 80, none, 79, ranks));
    expect(pickValue('T03', 80, { kind: 'lottery' }, 79, ranks)).toBeLessThan(pickValue('T03', 80, { kind: 'top', n: 5 }, 79, ranks));
  });
  it('moves toward a middling pick the further away the draft is', () => {
    expect(pickValue('T01', 80, none, 79, ranks)).toBeGreaterThan(pickValue('T01', 83, none, 79, ranks));
    expect(pickValue('T30', 80, none, 79, ranks)).toBeLessThan(pickValue('T30', 83, none, 79, ranks));
  });
  it('values a swap only as the gap between the two picks, and only to the team that gets the better one', () => {
    const swap = { kind: 'swap', otherTeam: 'T30', betterTo: 'AAA' } as const;
    expect(pickValue('T01', 80, swap, 79, ranks, 'AAA')).toBeGreaterThan(0);
    expect(pickValue('T01', 80, swap, 79, ranks, 'BBB')).toBe(0);
    expect(pickValue('T01', 80, swap, 79, ranks, 'AAA')).toBeLessThan(pickValue('T01', 80, none, 79, ranks));
  });
});

describe('assessTrade', () => {
  const s = baseState();
  it('calls a like-for-like swap fair', () => {
    const even = baseState();
    even.fba.teams.CAR[1] = { playerId: 'p00007', position: 'SG', rating: 67, age: 25, points: 0, contractEnd: 78, contractAmount: 1 };
    const r = assessTrade(even, { teams: ['BOS', 'CAR'], assets: [
      { kind: 'player', playerId: 'p00003', from: 'BOS', to: 'CAR' }, { kind: 'player', playerId: 'p00007', from: 'CAR', to: 'BOS' },
    ] })!;
    expect(r.verdict).toBe('fair');
    expect(r.favoured).toBeNull();
  });
  it('flags a star for a role player as lopsided toward the team getting the star', () => {
    const r = assessTrade(s, { teams: ['BOS', 'CAR'], assets: [
      { kind: 'player', playerId: 'p00001', from: 'BOS', to: 'CAR' }, { kind: 'player', playerId: 'p00007', from: 'CAR', to: 'BOS' },
    ] })!;
    expect(r.favoured).toBe('CAR');
    expect(r.verdict).toBe('lopsided');
    expect(r.sides.find(x => x.teamId === 'CAR')!.net).toBeGreaterThan(0);
  });
  it('nets to zero across every team, including three-team trades', () => {
    const r = assessTrade(s, { teams: ['BOS', 'CAR', 'MON'], assets: [
      { kind: 'player', playerId: 'p00001', from: 'BOS', to: 'MON' }, { kind: 'player', playerId: 'p00007', from: 'CAR', to: 'BOS' }, { kind: 'player', playerId: 'p00013', from: 'MON', to: 'CAR' },
    ] })!;
    expect(r.sides.reduce((n, x) => n + x.net, 0)).toBeCloseTo(0, 6);
    expect(r.sides).toHaveLength(3);
  });
  it('values picks, with a weak teams pick worth more than a strong one', () => {
    const weak = assessTrade(s, { teams: ['MON', 'CAR'], assets: [{ kind: 'ownPick', season: 80, from: 'MON', to: 'CAR', condition: { kind: 'none' } }] })!;
    const strong = assessTrade(s, { teams: ['MON', 'CAR'], assets: [{ kind: 'ownPick', season: 80, from: 'CAR', to: 'MON', condition: { kind: 'none' } }] })!;
    expect(weak.moved).toBeGreaterThan(strong.moved);
  });
  it('returns null with nothing in the trade, and treats a free gift as lopsided', () => {
    expect(assessTrade(s, { teams: ['BOS', 'CAR'], assets: [] })).toBeNull();
    const gift = assessTrade(s, { teams: ['BOS', 'CAR'], assets: [{ kind: 'player', playerId: 'p00005', from: 'BOS', to: 'CAR' }] })!;
    expect(gift.verdict).toBe('lopsided');
    expect(gift.favoured).toBe('CAR');
  });
});
