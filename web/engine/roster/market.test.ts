import { describe, expect, it } from 'vitest';
import { marketRows, openPositions } from './market';
import { baseState } from './testFixtures';

describe('marketRows', () => {
  it('lists free agents, rookies, D2 players, and unrestricted expired contracts', () => {
    const rows = marketRows(baseState());
    const byId = Object.fromEntries(rows.map(r => [r.playerId, r]));
    expect(byId.p00030).toMatchObject({ type: 'FA', scale: 'FBA', rating: 68, from: null, name: 'Azubuike Okoro' });
    expect(byId.p00031).toMatchObject({ type: 'Rookie', rating: null });
    expect(byId.p00023).toMatchObject({ type: 'D2', scale: 'D2', rating: 94, from: 'AMS' });
    expect(byId.p00003).toMatchObject({ type: 'Expired', from: 'BOS' });
    expect(byId.p00012).toBeUndefined();
    expect(byId.p00001).toBeUndefined();
  });

  it('sorts FBA-scale players by rating before D2 players', () => {
    const rows = marketRows(baseState());
    expect(rows.slice(0, 3).map(r => r.playerId)).toEqual(['p00032', 'p00030', 'p00004']);
    expect(rows.at(-1)!.scale).toBe('D2');
  });
});

describe('openPositions', () => {
  it('lists positions without a player', () => {
    expect(openPositions(baseState().fba.teams.CAR)).toEqual(['C']);
    expect(openPositions(baseState().fba.teams.BOS)).toEqual([]);
  });
});
