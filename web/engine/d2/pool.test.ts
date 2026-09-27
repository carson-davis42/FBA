import { describe, expect, it } from 'vitest';
import {
  compareRank, cutoffTies, lockPool, moveInOrder, poolProblems, poolSummary, poolWarnings, rankedOrder, startPool,
} from './pool';
import type { D2Result, D2State } from './state';
import { d2BaseState, d2LockedState, d2RatedState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: D2Result) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const pooled = (): D2State => ok(startPool(d2RatedState())).state;

describe('compareRank', () => {
  it('sorts by rating, then younger age, then name', () => {
    const list = [
      { rating: 70, age: 25, name: 'B' }, { rating: 70, age: 24, name: 'Z' }, { rating: 70, age: 24, name: 'A' },
      { rating: 71, age: 30, name: 'C' }, { rating: null, age: 20, name: 'N' },
    ];
    expect([...list].sort(compareRank).map(x => x.name)).toEqual(['C', 'A', 'Z', 'B', 'N']);
  });
});

describe('rankedOrder / startPool', () => {
  it('ranks every pool player at each position', () => {
    expect(rankedOrder(d2RatedState())).toEqual({
      PG: ['p00040', 'p00020', 'p00025'],
      SG: ['p00041', 'p00021', 'p00043'],
      SF: ['p00026', 'p00022'],
      PF: ['p00023', 'p00042', 'p00027'],
      C: ['p00028', 'p00044'],
    });
  });

  it('starts the pool only after ratings are finished, once', () => {
    const r = ok(startPool(d2RatedState()));
    expect(r.changed).toEqual(['pool']);
    expect(r.label).toBe('Start D2 pool');
    expect(r.state.pool).toMatchObject({ league: 'fbad2', season: 79, locked: false });
    expect(startPool(d2BaseState())).toEqual({ ok: false, problems: ['Finish D2 ratings first'] });
    expect(startPool(r.state)).toEqual({ ok: false, problems: ['The pool has already been started'] });
  });
});

describe('moveInOrder', () => {
  it('moves one player and ignores out-of-range moves', () => {
    const pool = pooled().pool!;
    expect(moveInOrder(pool, 'PG', 2, 0).order.PG).toEqual(['p00025', 'p00040', 'p00020']);
    expect(moveInOrder(pool, 'PG', 0, 1).order.PG).toEqual(['p00020', 'p00040', 'p00025']);
    expect(moveInOrder(pool, 'PG', 0, -1)).toBe(pool);
    expect(moveInOrder(pool, 'PG', 2, 3)).toBe(pool);
  });
});

describe('poolProblems', () => {
  it('is empty for a fresh pool', () => {
    expect(poolProblems(pooled())).toEqual([]);
  });

  it('flags missing, extra, and duplicate players', () => {
    const s = pooled();
    const bad = { ...s, pool: { ...s.pool!, order: { ...s.pool!.order, SG: ['p00041', 'p00041', 'p00020'] } } };
    expect(poolProblems(bad)).toEqual([
      'Kyron Smart is listed twice at SG',
      'Ben Montgomery is in the SG order but not in the D2 pool at SG',
      'Brooks Burrows (SG) is missing from the pool order',
      'Adrian Napoletani (SG) is missing from the pool order',
      'Use "Reset to ratings order" to rebuild the order',
    ]);
  });
});

describe('cutoffTies', () => {
  it('highlights everyone tied with the last player above the line when the tie crosses it', () => {
    const s = pooled();
    const tied: D2State = {
      ...s,
      d2: { ...s.d2, teams: { ...s.d2.teams, BER: s.d2.teams.BER.map(e => (e.playerId === 'p00025' ? { ...e, rating: 73 } : e)) } },
    };
    expect(cutoffTies(tied, 'PG', 2)).toEqual(['p00020', 'p00025']);
    expect(cutoffTies(s, 'PG', 2)).toEqual([]);
    expect(cutoffTies(s, 'SF', 2)).toEqual([]);
  });
});

describe('poolSummary / poolWarnings', () => {
  it('counts kept, bumped, draft pool, and open slots per position', () => {
    const sum = poolSummary(pooled(), 2);
    expect(sum.PG).toEqual({ pool: 3, kept: 1, bumped: 1, draftPool: 1, openSlots: 1 });
    expect(sum.SG).toEqual({ pool: 3, kept: 1, bumped: 0, draftPool: 1, openSlots: 1 });
    expect(sum.C).toEqual({ pool: 2, kept: 1, bumped: 0, draftPool: 1, openSlots: 1 });
    expect(poolWarnings(pooled(), 2)).toEqual([]);
  });

  it('warns when a position has fewer draft-pool players than open slots', () => {
    const s = pooled();
    const short: D2State = {
      ...s,
      reserves: { ...s.reserves, players: s.reserves.players.filter(p => p.playerId !== 'p00044') },
      pool: { ...s.pool!, order: { ...s.pool!.order, C: ['p00028'] } },
    };
    expect(poolWarnings(short, 2)).toEqual(['C: 1 open slot(s) but only 0 player(s) in the draft pool; some slots will stay empty']);
  });
});

describe('lockPool', () => {
  it('bumps roster players below the cutoff, fixes the draft pool, and shuffles one ticket per open slot', () => {
    const r = ok(lockPool(pooled(), ctx, () => 0, 2));
    expect(r.label).toBe('Lock D2 pool');
    expect(r.changed).toEqual(['d2', 'reserves', 'pool', 'draft', 'd2Tx']);
    expect(r.state.d2.teams.BER.map(e => e.playerId)).toEqual([null, null, 'p00026', null, 'p00028']);
    expect(r.state.d2.teams.BER[0]).toEqual({ playerId: null, position: 'PG', rating: null, age: null, points: 0 });
    expect(r.state.reserves.players.slice(-2)).toEqual([
      { playerId: 'p00025', position: 'PG', age: 24, rating: 72 },
      { playerId: 'p00027', position: 'PF', age: 31, rating: 66 },
    ]);
    expect(r.state.pool!.locked).toBe(true);
    expect(r.state.draft).toEqual({
      league: 'fbad2', season: 79, locked: false,
      tickets: ['BER', 'BER', 'BER', 'AMS'],
      pool: ['p00040', 'p00041', 'p00042', 'p00044'],
      picks: [],
    });
    expect(r.state.d2Tx.entries.at(-1)).toMatchObject({
      type: 'd2-pool',
      teams: ['BER'],
      lines: ['D2 pool locked: 4 in the draft pool, 2 bumped', 'Bumped to Reserves: PG-Milo Dean (BER)', 'Bumped to Reserves: PF-Adrian Grant (BER)'],
    });
  });

  it('finishes the draft step at once when there are no open slots', () => {
    const s = pooled();
    const full: D2State = {
      ...s,
      d2: { ...s.d2, teams: { AMS: s.d2.teams.AMS.map(e => (e.playerId ? e : { ...e, playerId: 'p00044', rating: 65, age: 26 })) } },
      reserves: { ...s.reserves, players: s.reserves.players.filter(p => p.playerId !== 'p00044') },
    };
    const r = ok(lockPool({ ...full, pool: { ...full.pool!, order: rankedOrder(full) } }, ctx, () => 0));
    expect(r.state.draft!.tickets).toEqual([]);
    expect(r.state.draft!.locked).toBe(true);
    expect(r.changed).toContain('calendar');
    expect(r.state.calendar.steps.find(x => x.id === 'fbad2-draft')!.done).toBe(true);
  });

  it('refuses when the pool is missing, already locked, or has problems', () => {
    expect(lockPool(d2RatedState(), ctx, () => 0, 2)).toEqual({ ok: false, problems: ['Start the pool first'] });
    const locked = ok(lockPool(pooled(), ctx, () => 0, 2)).state;
    expect(lockPool(locked, ctx, () => 0, 2)).toEqual({ ok: false, problems: ['The pool is already locked'] });
    const s = pooled();
    const bad = { ...s, pool: { ...s.pool!, order: { ...s.pool!.order, C: ['p00028'] } } };
    expect(lockPool(bad, ctx, () => 0, 2).ok).toBe(false);
  });
});

describe('d2LockedState fixture', () => {
  it('has the documented tickets and draft pool', () => {
    const s = d2LockedState();
    expect(s.draft!.tickets).toEqual(['BER', 'BER', 'BER', 'AMS']);
    expect(s.draft!.pool).toEqual(['p00040', 'p00041', 'p00042', 'p00044']);
  });
});
