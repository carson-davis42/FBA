import { describe, expect, it } from 'vitest';
import { payroll } from './rules';
import type { MoveResult, RosterState } from './state';
import { baseState } from './testFixtures';
import { makeTrade } from './trade';

const ctx = { batchId: 'bT' };
const ok = (r: MoveResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const problems = (r: MoveResult) => (r.ok ? [] : r.problems);

describe('makeTrade', () => {
  it('moves a player one way and a protected own pick the other way', () => {
    const r = ok(makeTrade(baseState(), {
      league: 'fba', teams: ['CAR', 'MON'], assets: [
        { kind: 'player', playerId: 'p00007', from: 'CAR', to: 'MON' },
        { kind: 'ownPick', season: 81, from: 'MON', to: 'CAR', condition: { kind: 'top', n: 4 } },
      ],
    }, ctx));
    expect(r.state.fba.teams.MON[1]).toMatchObject({ playerId: 'p00007', position: 'SG' });
    expect(r.state.fba.teams.CAR[1]).toMatchObject({ playerId: null, position: 'SG' });
    expect(r.state.picks.obligations).toEqual([{
      id: 'bT-1', season: 81, originalTeam: 'MON', owner: 'CAR', condition: { kind: 'top', n: 4 }, originalCondition: { kind: 'top', n: 4 },
      originSeason: 81, priority: 1, rolls: [], note: '',
    }]);
    expect(r.state.fbaTx.entries[0]).toEqual({ seq: 1, batchId: 'bT', type: 'trade', teams: ['CAR', 'MON'], lines: ['->MON SG-Terence Hopkins', '->CAR S81 Draft Pick(via MON)(4P)'] });
    expect(r.warnings).toEqual(['CAR: no SG', 'CAR: no C']);
    expect(r.changed.sort()).toEqual(['fba', 'fbaTx', 'picks']);
    expect(r.label).toBe('Trade CAR/MON');
  });

  it('blocks a trade that puts a team over the cap', () => {
    const r = makeTrade(baseState(), { league: 'fba', teams: ['CAR', 'BOS'], assets: [{ kind: 'player', playerId: 'p00009', from: 'CAR', to: 'BOS' }] }, ctx);
    expect(problems(r)).toEqual(['BOS: Payroll would be $30 (cap $27)']);
  });

  describe('trade ceiling', () => {
    // CAR is at exactly $25 with five $5 players; BOS's SG p00002 is the $7 target.
    const carAt25 = (swapAmount: number): RosterState => {
      const s = baseState();
      s.fba.teams.CAR = s.fba.teams.CAR.map(e => ({ ...e, ...(e.playerId === null ? { playerId: 'p00040', rating: 60, age: 25 } : {}), contractEnd: 80, contractAmount: 5 }));
      s.fba.teams.BOS = s.fba.teams.BOS.map(e => (e.playerId === 'p00002' ? { ...e, contractAmount: swapAmount } : e));
      return s;
    };
    const swap = { league: 'fba' as const, teams: ['CAR', 'BOS'], assets: [
      { kind: 'player' as const, playerId: 'p00007', from: 'CAR', to: 'BOS' },
      { kind: 'player' as const, playerId: 'p00002', from: 'BOS', to: 'CAR' },
    ] };

    it('lets a $25 team trade a $5 player for a $7 player and land on exactly $27', () => {
      const r = ok(makeTrade(carAt25(7), swap, ctx));
      expect(payroll(r.state.fba.teams.CAR, 79)).toBe(27);
    });

    it('blocks a trade that would take a team to $28 and names the $27 ceiling', () => {
      expect(problems(makeTrade(carAt25(8), swap, ctx))).toEqual(['CAR: Payroll would be $28 (cap $27)']);
    });
  });

  it('blocks slot problems once free agency is closed', () => {
    const s: RosterState = { ...baseState(), freeAgents: { ...baseState().freeAgents, locked: true } };
    const r = makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'player', playerId: 'p00007', from: 'CAR', to: 'MON' }] }, ctx);
    expect(problems(r)).toContain('CAR: no SG');
  });

  it('passes an owned obligation on without changing its condition', () => {
    const first = ok(makeTrade(baseState(), { league: 'fba', teams: ['MON', 'CAR'], assets: [{ kind: 'ownPick', season: 81, from: 'MON', to: 'CAR', condition: { kind: 'lottery' } }] }, ctx));
    const r = ok(makeTrade(first.state, { league: 'fba', teams: ['CAR', 'BOS'], assets: [{ kind: 'pick', obligationId: 'bT-1', from: 'CAR', to: 'BOS' }] }, { batchId: 'bU' }));
    expect(r.state.picks.obligations[0]).toMatchObject({ owner: 'BOS', condition: { kind: 'lottery' } });
    expect(r.state.fbaTx.entries.at(-1)!.lines).toEqual(['->BOS S81 Draft Pick(via MON)(LP)']);
  });

  it('adds a second obligation on an already-owed pick at the next priority', () => {
    const first = ok(makeTrade(baseState(), { league: 'fba', teams: ['MON', 'CAR'], assets: [{ kind: 'ownPick', season: 80, from: 'MON', to: 'CAR', condition: { kind: 'top', n: 9 } }] }, ctx));
    const r = ok(makeTrade(first.state, { league: 'fba', teams: ['MON', 'BOS'], assets: [{ kind: 'ownPick', season: 80, from: 'MON', to: 'BOS', condition: { kind: 'top', n: 11 } }] }, { batchId: 'bV' }));
    expect(r.state.picks.obligations.map(o => [o.owner, o.priority])).toEqual([['CAR', 1], ['BOS', 2]]);
  });

  it('validates assets', () => {
    const s = baseState();
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR'], assets: [] }, ctx))).toEqual(['A trade needs at least two teams', 'Add at least one player or pick']);
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'player', playerId: 'p00001', from: 'CAR', to: 'MON' }] }, ctx))).toEqual(['Gabriel Greenwood is not on CAR']);
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'pick', obligationId: 'nope', from: 'CAR', to: 'MON' }] }, ctx))).toEqual(['CAR does not own pick nope']);
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'ownPick', season: 90, from: 'CAR', to: 'MON', condition: { kind: 'none' } }] }, ctx))).toEqual(['Picks can be traded for S80–S83']);
    expect(problems(makeTrade(s, { league: 'fbad2', teams: ['AMS', 'X'], assets: [] }, ctx))).toContain('Unknown team X');
  });

  it('trades between D2 teams without contracts or picks', () => {
    const s = baseState();
    s.d2.teams.ZUR = [{ playerId: 'p00040', position: 'PG', rating: 70, age: 30, points: 0 }];
    const r = ok(makeTrade(s, { league: 'fbad2', teams: ['AMS', 'ZUR'], assets: [{ kind: 'player', playerId: 'p00020', from: 'AMS', to: 'ZUR' }, { kind: 'player', playerId: 'p00040', from: 'ZUR', to: 'AMS' }] }, ctx));
    expect(r.state.d2.teams.AMS[0].playerId).toBe('p00040');
    expect(r.changed.sort()).toEqual(['d2', 'd2Tx']);
  });
});
