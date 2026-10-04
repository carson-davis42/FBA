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
});
