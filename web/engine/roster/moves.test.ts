import { describe, expect, it } from 'vitest';
import { closeFreeAgency, editPlayer, editWarnings, freeAgencyBlockers, releasePlayer, signPlayer } from './moves';
import { payroll } from './rules';
import type { MoveResult, RosterState } from './state';
import { baseState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: MoveResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const problems = (r: MoveResult) => (r.ok ? [] : r.problems);

describe('signPlayer', () => {
  it('signs a free agent into an open slot', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.CAR[4]).toEqual({ playerId: 'p00030', position: 'C', rating: 68, age: 27, points: 0, contractEnd: 80, contractAmount: 2, restricted: false });
    expect(payroll(r.state.fba.teams.CAR, 79)).toBe(25);
    expect(r.state.freeAgents.players.map(p => p.playerId)).toEqual(['p00031', 'p00032']);
    expect(r.state.fbaTx.entries).toEqual([{ seq: 1, batchId: 'b1', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }]);
    expect(r.changed.sort()).toEqual(['fba', 'fbaTx', 'freeAgents']);
    expect(r.label).toBe('Sign Azubuike Okoro → CAR');
    expect(r.warnings).toEqual([]);
  });

  it('blocks deals that break the cap or contract rules', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 3, amount: 3, conflict: 'release' }, ctx))).toEqual(['Payroll would be $26 (cap $25)']);
    expect(problems(signPlayer(baseState(), { playerId: 'p00030', teamId: 'MON', years: 2, amount: 1, conflict: 'release' }, ctx))).toEqual(["Years can't exceed dollars (2 years needs at least $2)"]);
    expect(problems(signPlayer(baseState(), { playerId: 'p00030', teamId: 'MON', years: 5, amount: 5, conflict: 'release' }, ctx))).toEqual(['New signings are limited to 4 years']);
  });

  it('signs rookies only to the rookie scale, restricted, with a rating', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00031', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, ctx))).toEqual(['Enter a rating for this player']);
    expect(problems(signPlayer(baseState(), { playerId: 'p00031', teamId: 'MON', years: 3, amount: 3, rating: 70, conflict: 'release' }, ctx))).toEqual(['Rookie contracts are 1/$1 or 2/$2']);
    const r = ok(signPlayer(baseState(), { playerId: 'p00031', teamId: 'CAR', years: 1, amount: 1, rating: 70, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.CAR[4]).toMatchObject({ playerId: 'p00031', rating: 70, contractEnd: 79, contractAmount: 1, restricted: true });
  });

  it('signs a D2 player with a new FBA rating and opens his D2 slot', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, conflict: 'release' }, ctx))).toEqual(['Enter his FBA rating (D2 ratings are on a different scale)']);
    const r = ok(signPlayer(baseState(), { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, rating: 70, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.MON[1]).toMatchObject({ playerId: 'p00021', position: 'SG', rating: 70 });
    expect(r.state.d2.teams.AMS[1]).toEqual({ playerId: null, position: 'SG', rating: null, age: null, points: 0 });
    expect(r.state.d2Tx.entries[0].lines).toEqual(['SG-Brooks Burrows signed by MON (FBA)']);
    expect(r.changed.sort()).toEqual(['d2', 'd2Tx', 'fba', 'fbaTx']);
  });

  it('releases or cuts the current starter as part of the signing', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00032', teamId: 'BOS', years: 1, amount: 1, conflict: 'cut' }, ctx));
    expect(r.state.fba.teams.BOS.filter(e => e.position === 'SF').map(e => e.playerId)).toEqual(['p00032']);
    expect(r.state.freeAgents.players.find(p => p.playerId === 'p00003')).toEqual({ playerId: 'p00003', position: 'SF', age: 25, rating: 67, rookie: false, note: '' });
    expect(r.state.fbaTx.entries[0].lines).toEqual(['Signed SF-Mubiru Okeke (1/$1, thru S79)', "Cut SF-Koa'e Keano"]);
  });

  it('can keep both players and warns about the doubled slot', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00032', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx));
    expect(r.state.fba.teams.BOS).toHaveLength(6);
    expect(r.warnings).toEqual(['BOS: 2 players at SF']);
  });

  it('lets another team sign an unrestricted expired player', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00004', teamId: 'MON', years: 1, amount: 1, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.BOS[3]).toMatchObject({ playerId: null, position: 'PF' });
    expect(r.state.fba.teams.MON[3]).toMatchObject({ playerId: 'p00004' });
    expect(r.state.freeAgents.players.some(p => p.playerId === 'p00012')).toBe(true);
    expect(r.state.fbaTx.entries.map(e => [e.type, e.teams, e.lines])).toEqual([
      ['signed', ['MON'], ['Signed PF-Callan Schwangau (1/$1, thru S79)', 'Released PF-Dan Price']],
      ['released', ['BOS'], ['Released PF-Callan Schwangau (contract ended)']],
    ]);
  });

  it("protects a restricted expired player from other teams and lets his team re-sign him", () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00012', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx))).toEqual(['Dan Price is restricted: only MON can re-sign him']);
    const r = ok(signPlayer(baseState(), { playerId: 'p00012', teamId: 'MON', years: 5, amount: 5, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.MON[3]).toMatchObject({ playerId: 'p00012', contractEnd: 83, contractAmount: 5, restricted: false });
    expect(r.state.fbaTx.entries[0]).toMatchObject({ type: 'resigned', lines: ['Re-signed PF-Dan Price (5/$5, thru S83)'] });
    expect(r.label).toBe('Re-sign Dan Price → MON');
  });

  describe('$27 ceiling for own-player re-signings', () => {
    // MON payroll $24 (PG, SF, C at $8) with Dan Price's expired restricted PF contract waiting to be re-signed.
    const monAt24 = (): RosterState => {
      const s = baseState();
      s.fba.teams.MON = s.fba.teams.MON.map(e => (e.playerId && e.playerId !== 'p00012' ? { ...e, contractAmount: 8 } : e));
      return s;
    };
    const resign = (amount: number) => signPlayer(monAt24(), { playerId: 'p00012', teamId: 'MON', years: 1, amount, conflict: 'release' }, ctx);

    it.each([2, 3])('lets a team re-sign its own player up to payroll $%i + 24', amount => {
      expect(payroll(ok(resign(amount)).state.fba.teams.MON, 79)).toBe(24 + amount);
    });

    it('blocks a re-signing that would pass $27', () => {
      expect(problems(resign(4))).toEqual(['Payroll would be $28 (cap $27)']);
    });

    it('holds outside free agents to the $25 cap', () => {
      expect(problems(signPlayer(monAt24(), { playerId: 'p00030', teamId: 'MON', years: 1, amount: 2, conflict: 'keep' }, ctx))).toEqual(['Payroll would be $26 (cap $25)']);
      expect(problems(signPlayer(monAt24(), { playerId: 'p00021', teamId: 'MON', years: 1, amount: 2, rating: 70, conflict: 'keep' }, ctx))).toEqual(['Payroll would be $26 (cap $25)']);
      expect(problems(signPlayer(monAt24(), { playerId: 'p00031', teamId: 'MON', years: 2, amount: 2, rating: 70, conflict: 'keep' }, ctx))).toEqual(['Payroll would be $26 (cap $25)']);
    });
  });

  it('refuses to sign a player who is listed in more than one place', () => {
    const dup: RosterState = {
      ...baseState(),
      freeAgents: { ...baseState().freeAgents, players: [...baseState().freeAgents.players, { playerId: 'p00021', position: 'SG', age: 26, rating: 72, rookie: false, note: '' }] },
    };
    expect(problems(signPlayer(dup, { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, rating: 70, conflict: 'release' }, ctx)))
      .toEqual(['Brooks Burrows is listed in more than one place (free agents, D2 AMS); fix the data first']);
  });

  it('refuses unknown players and closed free agency', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00001', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx))).toEqual(['That player is not available to sign']);
    const closed: RosterState = { ...baseState(), freeAgents: { ...baseState().freeAgents, locked: true } };
    expect(problems(signPlayer(closed, { playerId: 'p00030', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx))).toEqual(['Free agency is closed']);
  });
});

describe('releasePlayer', () => {
  it('releases an FBA player to the free-agent pool', () => {
    const r = ok(releasePlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00002', kind: 'released' }, ctx));
    expect(r.state.fba.teams.BOS[1]).toMatchObject({ playerId: null, position: 'SG' });
    expect(r.state.freeAgents.players.at(-1)).toMatchObject({ playerId: 'p00002', rating: 88 });
    expect(r.state.fbaTx.entries[0]).toMatchObject({ type: 'released', teams: ['BOS'], lines: ['Released SG-Yasin Milovanovic'] });
  });

  it('cuts a D2 player to Reserves, keeping his D2 rating', () => {
    const r = ok(releasePlayer(baseState(), { league: 'fbad2', teamId: 'AMS', playerId: 'p00023', kind: 'cut' }, ctx));
    expect(r.state.reserves.players.at(-1)).toEqual({ playerId: 'p00023', position: 'PF', age: 22, rating: 94 });
    expect(r.state.d2Tx.entries[0].lines).toEqual(['Cut PF-Maddox Dean']);
    expect(r.changed.sort()).toEqual(['d2', 'd2Tx', 'reserves']);
  });

  it('sends FBA releases to Reserves after free agency closes', () => {
    const closed: RosterState = { ...baseState(), freeAgents: { ...baseState().freeAgents, locked: true } };
    const r = ok(releasePlayer(closed, { league: 'fba', teamId: 'BOS', playerId: 'p00002', kind: 'cut' }, ctx));
    expect(r.state.reserves.players.at(-1)).toEqual({ playerId: 'p00002', position: 'SG', age: 28, rating: null });
    expect(r.changed).not.toContain('freeAgents');
  });

  it('refuses a player who is not on the team', () => {
    expect(problems(releasePlayer(baseState(), { league: 'fba', teamId: 'CAR', playerId: 'p00002', kind: 'cut' }, ctx))).toEqual(['That player is not on CAR']);
  });
});

describe('editPlayer', () => {
  it('applies changes and logs them', () => {
    const r = ok(editPlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00001', changes: { rating: 96, contractEnd: 81 } }, ctx));
    expect(r.state.fba.teams.BOS[0]).toMatchObject({ rating: 96, contractEnd: 81 });
    expect(r.state.fbaTx.entries[0]).toMatchObject({ type: 'edit', lines: ['Edited PG-Gabriel Greenwood: rating 95→96, contract end S80→S81'] });
  });

  it('treats a missing restricted field as false, and does not log or store an unchanged restricted: false', () => {
    const r = ok(editPlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00001', changes: { rating: 96, restricted: false } }, ctx));
    expect(r.state.fba.teams.BOS[0]).toMatchObject({ rating: 96 });
    expect(Object.hasOwn(r.state.fba.teams.BOS[0], 'restricted')).toBe(false);
    expect(r.state.fbaTx.entries[0]).toMatchObject({ type: 'edit', lines: ['Edited PG-Gabriel Greenwood: rating 95→96'] });
  });

  it('warns without blocking when an edit breaks a rule', () => {
    const input = { league: 'fba' as const, teamId: 'BOS', playerId: 'p00001', changes: { contractAmount: 10 } };
    expect(editWarnings(baseState(), input)).toEqual(["Amount can't exceed $8"]);
    const r = ok(editPlayer(baseState(), input, ctx));
    expect(r.warnings).toEqual(editWarnings(baseState(), input));
  });
});

describe('closing free agency', () => {
  it('lists what blocks closing', () => {
    expect(freeAgencyBlockers(baseState())).toEqual([
      "BOS: SF-Koa'e Keano's contract expired (re-sign or release him)",
      "BOS: PF-Callan Schwangau's contract expired (re-sign or release him)",
      'CAR: no C',
      'MON: no SG',
      "MON: PF-Dan Price's contract expired (re-sign or release him)",
    ]);
    expect(problems(closeFreeAgency(baseState(), ctx))).toHaveLength(5);
  });

  it('moves unsigned free agents to D2 Reserves and locks the pool', () => {
    let s = baseState();
    s = ok(signPlayer(s, { playerId: 'p00003', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00004', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00030', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00012', teamId: 'MON', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, rating: 70, conflict: 'keep' }, ctx)).state;
    expect(freeAgencyBlockers(s)).toEqual([]);
    const r = ok(closeFreeAgency(s, ctx));
    expect(r.state.freeAgents).toEqual({ league: 'fba', season: 79, locked: true, players: [] });
    expect(r.state.reserves.players.map(p => [p.playerId, p.rating])).toEqual([['p00040', null], ['p00031', null], ['p00032', null]]);
    expect(r.state.reserves.players.map(p => p.fromFba ?? false)).toEqual([false, true, true]);
    expect(r.state.reserves.players.map(p => p.fbaRating ?? null)).toEqual([null, null, 69]);
    expect(r.state.fbaTx.entries.at(-1)).toMatchObject({ type: 'fa-closed', lines: ['Free agency closed: 2 unsigned players moved to D2 Reserves'] });
    expect(r.changed.sort()).toEqual(['fbaTx', 'freeAgents', 'reserves']);
  });

  describe('payroll above the $25 cap', () => {
    const readyToClose = (bosSgAmount: number): RosterState => {
      let s = baseState();
      s = ok(signPlayer(s, { playerId: 'p00003', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
      s = ok(signPlayer(s, { playerId: 'p00004', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
      s = ok(signPlayer(s, { playerId: 'p00030', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
      s = ok(signPlayer(s, { playerId: 'p00012', teamId: 'MON', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
      s = ok(signPlayer(s, { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, rating: 70, conflict: 'keep' }, ctx)).state;
      s.fba.teams.BOS = s.fba.teams.BOS.map(e => (e.playerId === 'p00002' ? { ...e, contractAmount: bosSgAmount } : e)); // BOS payroll is $18 plus this
      return s;
    };

    it.each([8, 9])('can close with a team at $%i + 18 (i.e. $26 or $27)', sg => {
      const s = readyToClose(sg);
      expect(payroll(s.fba.teams.BOS, 79)).toBe(18 + sg);
      expect(freeAgencyBlockers(s)).toEqual([]);
      ok(closeFreeAgency(s, ctx));
    });

    it('still blocks closing when a team is above $27', () => {
      const s = readyToClose(10);
      expect(freeAgencyBlockers(s)).toEqual(['BOS: Payroll would be $28 (cap $27)']);
      expect(problems(closeFreeAgency(s, ctx))).toEqual(['BOS: Payroll would be $28 (cap $27)']);
    });
  });
});
