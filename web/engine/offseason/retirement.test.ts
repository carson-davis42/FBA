import { describe, expect, it } from 'vitest';
import { calendarFor } from '../shared/calendar';
import type { CalendarFile, Player, TransactionsFile } from '../shared/types';
import { baseState } from '../roster/testFixtures';
import { autoRetirees, RETIRE_AGE, retirePlayers, retirementPool, type RetireState, unknownAges } from './retirement';

const calendarAtRetirement = (): CalendarFile => {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === 'retirement');
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
};

// Ages at S79: p00001 (BOS PG) 33, p00002 (BOS SG) 32, p00006 (CAR PG) 31, p00020 (AMS PG) 32, p00040 (Reserve PG) 32, p00021 (AMS SG) 31; the rest are unknown.
const BIRTH: Record<string, number> = { p00001: 46, p00002: 47, p00006: 48, p00020: 47, p00040: 47, p00021: 48 };
function withBirths(s: RetireState, birth: (id: string) => number | null): RetireState {
  const players = { ...s.players, players: Object.fromEntries(Object.entries(s.players.players).map(([id, p]): [string, Player] => [id, { ...p, birthSeason: birth(id) }])) };
  return { ...s, players };
}
function state(over: Partial<RetireState> = {}): RetireState {
  return { ...withBirths({ ...baseState(), calendar: calendarAtRetirement() }, id => BIRTH[id] ?? null), ...over };
}
const nobodyOld = () => withBirths(state(), () => 70);
const ctx = { batchId: 'b1' };
const writeMap = (r: { ok: true; writes: { path: string; doc: unknown }[] }) => Object.fromEntries(r.writes.map(w => [w.path, w.doc]));

describe('retirement pool', () => {
  it('covers FBA rosters, D2 rosters and Reserves, skipping vacant spots', () => {
    const pool = retirementPool(state());
    expect(RETIRE_AGE).toBe(32);
    expect(pool.length).toBe(13 + 5 + 1);
    expect(pool.find(r => r.playerId === 'p00001')).toEqual({ playerId: 'p00001', name: 'Gabriel Greenwood', league: 'fba', teamId: 'BOS', position: 'PG', age: 33 });
    expect(pool.find(r => r.playerId === 'p00020')).toMatchObject({ league: 'fbad2', teamId: 'AMS', age: 32 });
    expect(pool.find(r => r.playerId === 'p00040')).toMatchObject({ league: 'fbad2', teamId: null, position: 'PG', age: 32 });
    expect(pool.find(r => r.playerId === 'p00003')!.age).toBeNull();
  });
  it('autoRetirees takes 32 and 33 but not 31; unknownAges lists the null ages', () => {
    const pool = retirementPool(state());
    expect(autoRetirees(pool).map(r => r.playerId).sort()).toEqual(['p00001', 'p00002', 'p00020', 'p00040']);
    expect(unknownAges(pool).every(r => r.age === null)).toBe(true);
    expect(unknownAges(pool).some(r => r.playerId === 'p00006')).toBe(false);
    expect(unknownAges(pool).some(r => r.playerId === 'p00003')).toBe(true);
  });
});

describe('retirePlayers', () => {
  it('refuses off the retirement step, even with an empty list', () => {
    const r = retirePlayers(state({ calendar: calendarFor(79) }), [], ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toContain('Retirement step');
  });
  it('refuses an unknown early id', () => {
    expect(retirePlayers(state(), ['p09999'], ctx)).toEqual({ ok: false, problems: ['p09999 is not on a pro roster or Reserves'] });
  });
  it('retires the auto list plus early ids, ignoring duplicates', () => {
    const r = retirePlayers(state(), ['p00006', 'p00001', 'p00006'], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Retirement: 5 players retired');
    const w = writeMap(r);
    const fba = w['leagues/fba/S79/rosters.json'] as { teams: Record<string, { playerId: string | null; position: string }[]> };
    expect(fba.teams.BOS.map(e => e.playerId)).toEqual([null, null, 'p00003', 'p00004', 'p00005']);
    expect(fba.teams.BOS[0].position).toBe('PG');
    expect(fba.teams.CAR[0].playerId).toBeNull();
    const d2 = w['leagues/fbad2/S79/rosters.json'] as { teams: Record<string, { playerId: string | null }[]> };
    expect(d2.teams.AMS[0].playerId).toBeNull();
    expect(d2.teams.AMS.length).toBe(5);
    expect((w['leagues/fbad2/S79/reserves.json'] as { players: unknown[] }).players).toEqual([]);
    const players = (w['players.json'] as { players: Record<string, Player> }).players;
    expect(players.p00001.retired).toEqual({ season: 79, league: 'fba', teamId: 'BOS', position: 'PG' });
    expect(players.p00020.retired).toEqual({ season: 79, league: 'fbad2', teamId: 'AMS', position: 'PG' });
    expect(players.p00040.retired).toEqual({ season: 79, league: 'fbad2', teamId: null, position: 'PG' });
    expect(players.p00006.retired).toEqual({ season: 79, league: 'fba', teamId: 'CAR', position: 'PG' });
    expect(players.p00005.retired).toBeUndefined();
  });
  it('writes one retired tx entry per league with retirees, and only the changed docs plus the calendar', () => {
    const r = retirePlayers(state(), [], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.writes.map(x => x.path).sort()).toEqual([
      'calendar.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fbad2/S79/reserves.json',
      'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json', 'players.json',
    ]);
    const w = writeMap(r);
    const fbaTx = w['leagues/fba/S79/transactions.json'] as TransactionsFile;
    expect(fbaTx.entries).toHaveLength(1);
    expect(fbaTx.entries[0]).toMatchObject({ type: 'retired', batchId: 'b1' });
    expect(fbaTx.entries[0].lines).toEqual(['Retired PG-Gabriel Greenwood (BOS, age 33)', 'Retired SG-Yasin Milovanovic (BOS, age 32)']);
    const d2Tx = w['leagues/fbad2/S79/transactions.json'] as TransactionsFile;
    expect(d2Tx.entries).toHaveLength(1);
    expect(d2Tx.entries[0].lines).toEqual(['Retired PG-Ben Montgomery (AMS, age 32)', 'Retired PG-Kris Dyer (Reserves, age 32)']);
    expect((w['calendar.json'] as CalendarFile).steps.find(s => s.id === 'retirement')!.done).toBe(true);
  });
  it('leaves untouched docs out of the writes', () => {
    const r = retirePlayers(nobodyOld(), ['p00001'], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.writes.map(x => x.path).sort()).toEqual(['calendar.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'players.json']);
  });
  it('succeeds with nobody to retire, writing only the calendar', () => {
    const r = retirePlayers(nobodyOld(), [], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Retirement: no one retired');
    expect(r.writes.map(x => x.path)).toEqual(['calendar.json']);
  });
  it('uses the singular for one player', () => {
    const r = retirePlayers(nobodyOld(), ['p00003'], ctx);
    expect(r.ok && r.label).toBe('Retirement: 1 player retired');
  });
  it('ignores roster locks', () => {
    expect(retirePlayers(state(), [], { batchId: 'b1', phase: 'post-deadline' }).ok).toBe(true);
  });
});
