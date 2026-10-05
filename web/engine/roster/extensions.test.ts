import { describe, expect, it } from 'vitest';
import { RostersFile, TransactionsFile } from '../shared/types';
import { extendPlayer } from './moves';
import { baseState } from './testFixtures';

const input = { teamId: 'BOS', playerId: 'p00001', amount: 7 };
const ctx = { batchId: 'extension' };

describe('contract extensions', () => {
  it.each(['open', 'd2-cycle', 'fba-season', 'post-deadline'] as const)('extends during %s without changing other player fields or the source state', phase => {
    const state = baseState();
    state.freeAgents.locked = true;
    const snapshot = structuredClone(state);
    const result = extendPlayer(state, input, { ...ctx, phase });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.problems.join('; '));
    expect(state).toEqual(snapshot);
    expect(result.state.fba.teams.BOS[0]).toEqual({ ...state.fba.teams.BOS[0], contractEnd: 81, contractAmount: 7 });
    expect(result.changed).toEqual(['fba', 'fbaTx']);
    expect(result.state.fbaTx.entries).toEqual([{
      seq: 1, batchId: 'extension', type: 'extended', teams: ['BOS'],
      lines: ['Extended PG-Gabriel Greenwood: contract end S80→S81, amount $8→$7 (3/$7)'],
    }]);
    expect(RostersFile.safeParse(result.state.fba).success).toBe(true);
    expect(TransactionsFile.safeParse(result.state.fbaTx).success).toBe(true);
  });

  it('allows unchanged pay', () => {
    expect(extendPlayer(baseState(), { ...input, amount: 8 }, ctx).ok).toBe(true);
  });

  it('allows a raise greater than $1 and preserves restricted status', () => {
    const result = extendPlayer(baseState(), { teamId: 'MON', playerId: 'p00010', amount: 5 }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.fba.teams.MON[0]).toMatchObject({ contractEnd: 81, contractAmount: 5, restricted: true });
  });

  it('does not apply new-signing or re-signing length limits to extensions', () => {
    const state = baseState();
    state.fba.teams.BOS[0].contractEnd = 83;
    state.fba.teams.BOS[0].age = 26;
    expect(extendPlayer(state, { ...input, amount: 8 }, ctx).ok).toBe(true);
  });

  it('rejects a decrease greater than $1', () => {
    expect(extendPlayer(baseState(), { ...input, amount: 6 }, ctx)).toEqual({ ok: false, problems: ['Pay can decrease by at most $1 per season extended'] });
  });

  it('counts all remaining seasons, including the current one, for length versus pay', () => {
    expect(extendPlayer(baseState(), { teamId: 'MON', playerId: 'p00010', amount: 2 }, ctx)).toEqual({ ok: false, problems: ["Years can't exceed dollars (3 years needs at least $3)"] });
    expect(extendPlayer(baseState(), { teamId: 'MON', playerId: 'p00010', amount: 3 }, ctx).ok).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid pay %s', amount => {
    const result = extendPlayer(baseState(), { ...input, amount }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('Amount must be a whole number of dollars, at least $1');
  });

  it('enforces the salary maximum and immediate team cap', () => {
    const tooMuch = extendPlayer(baseState(), { ...input, amount: 9 }, ctx);
    expect(tooMuch).toEqual({ ok: false, problems: ["Amount can't exceed $8"] });
    expect(extendPlayer(baseState(), { teamId: 'CAR', playerId: 'p00007', amount: 4 }, ctx)).toEqual({ ok: false, problems: ['Payroll would be $26 (cap $25)'] });
  });

  it('keeps the $25 cap for extensions even when the team is legally above it', () => {
    const state = baseState();
    state.fba.teams.BOS[1].contractAmount = 11; // BOS payroll $27
    expect(extendPlayer(state, input, { ...ctx }).ok).toBe(false);
    expect(extendPlayer(state, { ...input, amount: 8 }, ctx)).toEqual({ ok: false, problems: ['Payroll would be $27 (cap $25)'] });
  });

  it('requires an active contract on the selected team', () => {
    expect(extendPlayer(baseState(), { ...input, teamId: 'MON' }, ctx).ok).toBe(false);
    expect(extendPlayer(baseState(), { ...input, playerId: 'p00003' }, ctx).ok).toBe(false);
    const state = baseState();
    state.fba.teams.BOS[0].contractAmount = null;
    expect(extendPlayer(state, input, ctx).ok).toBe(false);
  });

  it('does not alter final roster or transaction records', () => {
    for (const key of ['fba', 'fbaTx'] as const) {
      const state = baseState();
      state[key].locked = true;
      expect(extendPlayer(state, input, ctx)).toEqual({ ok: false, problems: ['This season is final (locked)'] });
    }
  });

  it.each([
    { age: 30, contractEnd: 80, allowed: true },
    { age: 31, contractEnd: 79, allowed: true },
    { age: 31, contractEnd: 80, allowed: false },
    { age: 32, contractEnd: 79, allowed: false },
  ])('age $age, current contract through S$contractEnd: extension allowed=$allowed', ({ age, contractEnd, allowed }) => {
    const state = baseState();
    Object.assign(state.fba.teams.BOS[0], { age, contractEnd });
    const snapshot = structuredClone(state);
    const result = extendPlayer(state, input, ctx);
    expect(result.ok).toBe(allowed);
    expect(state).toEqual(snapshot);
    if (!allowed && !result.ok) expect(result.problems).toContain(`Contract cannot extend past S${79 + 32 - age}, the player’s age-32 season`);
  });

  it('uses birth season over a conflicting edited roster age', () => {
    const state = baseState();
    state.players.players.p00001.birthSeason = 47; // Age 32 in S79.
    state.fba.teams.BOS[0].age = 20;
    expect(extendPlayer(state, input, ctx)).toEqual({ ok: false, problems: ['Contract cannot extend past S79, the player’s age-32 season'] });
  });

  it('cannot bypass retirement with repeated one-season extensions', () => {
    const state = baseState();
    Object.assign(state.fba.teams.BOS[0], { age: 30, contractEnd: 79 });
    const first = extendPlayer(state, input, ctx);
    if (!first.ok) throw new Error(first.problems.join('; '));
    const second = extendPlayer(first.state, input, ctx);
    if (!second.ok) throw new Error(second.problems.join('; '));
    expect(second.state.fba.teams.BOS[0].contractEnd).toBe(81);
    expect(extendPlayer(second.state, input, ctx)).toEqual({ ok: false, problems: ['Contract cannot extend past S81, the player’s age-32 season'] });
  });

  it('can check retirement from birth season when the roster age is missing', () => {
    const state = baseState();
    state.players.players.p00001.birthSeason = 49; // Age 32 in S81.
    state.fba.teams.BOS[0].age = null;
    expect(extendPlayer(state, input, ctx).ok).toBe(true);
  });

  it('blocks extensions when age and birth season are both unknown', () => {
    const state = baseState();
    state.fba.teams.BOS[0].age = null;
    expect(extendPlayer(state, input, ctx)).toEqual({ ok: false, problems: ['Set the player’s age before extending his contract so the retirement limit can be checked'] });
  });

  it('cannot extend a player already marked retired', () => {
    const state = baseState();
    state.players.players.p00001.retired = { season: 78, league: 'fba', teamId: 'BOS', position: 'PG' };
    expect(extendPlayer(state, input, ctx)).toEqual({ ok: false, problems: ['A retired player cannot be extended'] });
  });
});
