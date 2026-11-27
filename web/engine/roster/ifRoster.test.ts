import { describe, expect, it } from 'vitest';
import { ifRoster } from './ifRoster';
import { baseState } from './testFixtures';

const input = (over: Partial<Parameters<typeof ifRoster>[1]> = {}) => ({ playerId: 'p00030', teamId: 'CAR', years: 1, amount: 2, conflict: 'release' as const, ...over });

describe('ifRoster', () => {
  it('shows the roster after a legal signing, with the new player in', () => {
    const r = ifRoster(baseState(), input())!;
    expect(r.ok).toBe(true);
    expect(r.entries.find(e => e.playerId === 'p00030')).toMatchObject({ position: 'C', contractAmount: 2, contractEnd: 79 });
    expect(r.leaving).toEqual([]);
  });
  it('shows who would go when the player at his position is released', () => {
    // MON holds a C (p00013); a C joining with "release" pushes him out.
    const r = ifRoster(baseState(), input({ teamId: 'MON' }))!;
    expect(r.ok).toBe(true);
    expect(r.leaving.map(e => e.playerId)).toEqual(['p00013']);
    expect(r.entries.some(e => e.playerId === 'p00013')).toBe(false);
  });
  it('keeps both when the choice is to keep both for now', () => {
    const r = ifRoster(baseState(), input({ teamId: 'MON', conflict: 'keep' }))!;
    expect(r.entries.filter(e => e.position === 'C').map(e => e.playerId).sort()).toEqual(['p00013', 'p00030']);
    expect(r.leaving).toEqual([]);
  });
  it('still shows the roster for a signing that is not allowed, with the reasons', () => {
    // BOS (keeping its C) has no cap room for another $8 contract.
    const r = ifRoster(baseState(), input({ teamId: 'BOS', amount: 8, years: 1, conflict: 'keep' }))!;
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.entries.some(e => e.playerId === 'p00030')).toBe(true);
  });
  it('is null for an unknown team', () => {
    expect(ifRoster(baseState(), input({ teamId: 'XXX' }))).toBeNull();
  });
});
