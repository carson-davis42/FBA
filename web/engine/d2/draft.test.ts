import { describe, expect, it } from 'vitest';
import { availableFor, isDraftPickLabel, makePick, neededPositions, onTheClock, rerollOrder, skipPick } from './draft';
import { mulberry32 } from './random';
import type { D2Result, D2State } from './state';
import { d2LockedState, d2RatedState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: D2Result) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};

describe('onTheClock / neededPositions / availableFor', () => {
  it('shows the team on the clock, its needs, and the eligible players best first', () => {
    const s = d2LockedState();
    expect(onTheClock(s.draft)).toEqual({ pickNo: 1, teamId: 'BER' });
    expect(neededPositions(s, 'BER')).toEqual(['PG', 'SG', 'PF']);
    expect(availableFor(s, 'BER').map(p => p.playerId)).toEqual(['p00040', 'p00041', 'p00042']);
    expect(availableFor(s, 'AMS').map(p => p.playerId)).toEqual(['p00044']);
  });

  it('never offers bumped players or Reserves outside the draft pool', () => {
    const ids = availableFor(d2LockedState(), 'BER').map(p => p.playerId);
    expect(ids).not.toContain('p00025');
    expect(ids).not.toContain('p00043');
  });

  it('is empty with no draft', () => {
    expect(onTheClock(null)).toBeNull();
    expect(availableFor(d2RatedState(), 'BER')).toEqual([]);
  });
});

describe('makePick', () => {
  it('puts the player in the open slot, removes him from Reserves, and logs the pick', () => {
    const r = ok(makePick(d2LockedState(), 'p00041', ctx));
    expect(r.label).toBe('D2 draft #1: BER selects Kyron Smart');
    expect(r.changed).toEqual(['d2', 'reserves', 'draft', 'd2Tx']);
    expect(r.state.d2.teams.BER[1]).toEqual({ playerId: 'p00041', position: 'SG', rating: 74, age: 23, points: 0 });
    expect(r.state.reserves.players.some(p => p.playerId === 'p00041')).toBe(false);
    expect(r.state.draft!.picks).toEqual([{ teamId: 'BER', playerId: 'p00041', position: 'SG' }]);
    expect(r.state.d2Tx.entries.at(-1)).toMatchObject({ type: 'drafted', teams: ['BER'], lines: ['D2 Draft #1: BER selects SG-Kyron Smart'] });
    expect(onTheClock(r.state.draft)).toEqual({ pickNo: 2, teamId: 'BER' });
  });

  it("refuses a player the team can't take", () => {
    expect(makePick(d2LockedState(), 'p00044', ctx)).toEqual({
      ok: false, problems: ["Brycen Holcomb can't be drafted by BER: not in the draft pool at a position they need"],
    });
  });

  it('finishes the draft on the last ticket and marks the calendar step', () => {
    let s: D2State = d2LockedState();
    for (const id of ['p00041', 'p00040', 'p00042']) s = ok(makePick(s, id, ctx)).state;
    const last = ok(makePick(s, 'p00044', ctx));
    expect(last.label).toBe('D2 draft #4: AMS selects Brycen Holcomb');
    expect(last.changed).toEqual(['d2', 'reserves', 'draft', 'd2Tx', 'calendar']);
    expect(last.state.draft!.locked).toBe(true);
    expect(last.state.calendar.steps.find(x => x.id === 'fbad2-draft')!.done).toBe(true);
    expect(onTheClock(last.state.draft)).toBeNull();
    expect(makePick(last.state, 'p00043', ctx)).toEqual({ ok: false, problems: ['The draft is finished'] });
  });

  it('asks for the pool to be locked first when there is no draft', () => {
    expect(makePick(d2RatedState(), 'p00040', ctx)).toEqual({ ok: false, problems: ['Lock the pool first'] });
  });
});

describe('skipPick', () => {
  it('is refused while an eligible player is left', () => {
    expect(skipPick(d2LockedState(), ctx)).toEqual({ ok: false, problems: ['Skip is only allowed when no eligible player is left'] });
  });

  it('records a skipped pick when nobody fits', () => {
    let s: D2State = d2LockedState();
    for (const id of ['p00041', 'p00040', 'p00042']) s = ok(makePick(s, id, ctx)).state;
    s = { ...s, reserves: { ...s.reserves, players: s.reserves.players.filter(p => p.playerId !== 'p00044') } };
    const r = ok(skipPick(s, ctx));
    expect(r.label).toBe('D2 draft #4: AMS skips');
    expect(r.changed).toEqual(['draft', 'd2Tx', 'calendar']);
    expect(r.state.draft!.picks.at(-1)).toEqual({ teamId: 'AMS', playerId: null, position: null });
    expect(r.state.d2Tx.entries.at(-1)!.lines).toEqual(['D2 Draft #4: AMS skips (no eligible player)']);
    expect(r.state.draft!.locked).toBe(true);
  });
});

describe('rerollOrder', () => {
  it('reshuffles the tickets before the first pick only', () => {
    const s = d2LockedState();
    const r = ok(rerollOrder(s, mulberry32(3)));
    expect(r.label).toBe('Re-roll D2 draft order');
    expect(r.changed).toEqual(['draft']);
    expect([...r.state.draft!.tickets].sort()).toEqual(['AMS', 'BER', 'BER', 'BER']);
    const picked = ok(makePick(s, 'p00041', ctx)).state;
    expect(rerollOrder(picked, mulberry32(3))).toEqual({ ok: false, problems: ['The order can only be re-rolled before the first pick'] });
    expect(rerollOrder(d2RatedState(), mulberry32(3))).toEqual({ ok: false, problems: ['There is no draft order to re-roll'] });
  });
});

describe('isDraftPickLabel', () => {
  it('recognizes draft pick labels', () => {
    expect(isDraftPickLabel('D2 draft #3: BER selects Kris Dyer')).toBe(true);
    expect(isDraftPickLabel('Lock D2 pool')).toBe(false);
    expect(isDraftPickLabel(null)).toBe(false);
  });
});
