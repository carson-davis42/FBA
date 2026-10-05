import { describe, expect, it } from 'vitest';
import { capProblem, contractEndFor, contractProblems, isExpired, normalizeRoster, payroll, slotProblems, TRADE_CAP, vacantEntry } from './rules';
import { appendTx, docPath, findOnRoster } from './state';
import { baseState } from './testFixtures';

describe('payroll and expiry', () => {
  const s = baseState();
  it('counts only active contracts', () => {
    expect(payroll(s.fba.teams.BOS, 79)).toBe(23);
    expect(payroll(s.fba.teams.MON, 79)).toBe(6);
  });
  it('knows expired contracts', () => {
    expect(isExpired(s.fba.teams.BOS[2], 79)).toBe(true);
    expect(isExpired(s.fba.teams.BOS[0], 79)).toBe(false);
    expect(isExpired(s.fba.teams.CAR[4], 79)).toBe(false);
  });
  it('computes contract end', () => {
    expect(contractEndFor(79, 2)).toBe(80);
  });
});

describe('contractProblems', () => {
  it('accepts valid new, re-sign, and rookie deals', () => {
    expect(contractProblems({ years: 2, amount: 2 }, 'new')).toEqual([]);
    expect(contractProblems({ years: 5, amount: 6 }, 'resign')).toEqual([]);
    expect(contractProblems({ years: 1, amount: 1 }, 'rookie')).toEqual([]);
  });
  it('enforces the rules', () => {
    expect(contractProblems({ years: 2, amount: 1 }, 'new')).toEqual(["Years can't exceed dollars (2 years needs at least $2)"]);
    expect(contractProblems({ years: 5, amount: 6 }, 'new')).toEqual(['New signings are limited to 4 years']);
    expect(contractProblems({ years: 6, amount: 8 }, 'resign')).toEqual(['Re-signings are limited to 5 years']);
    expect(contractProblems({ years: 1, amount: 9 }, 'new')).toEqual(["Amount can't exceed $8"]);
    expect(contractProblems({ years: 0, amount: 1.5 }, 'new')).toEqual(['Years must be a whole number, at least 1', 'Amount must be a whole number of dollars, at least $1']);
    expect(contractProblems({ years: 3, amount: 3 }, 'rookie')).toEqual(['Rookie contracts are 1/$1 or 2/$2']);
  });
  it('checks the cap', () => {
    expect(capProblem(25)).toBeNull();
    expect(capProblem(26)).toBe('Payroll would be $26 (cap $25)');
    expect(capProblem(27, TRADE_CAP)).toBeNull();
    expect(capProblem(28, TRADE_CAP)).toBe('Payroll would be $28 (cap $27)');
  });
});

describe('slots', () => {
  it('reports missing and doubled positions', () => {
    const s = baseState();
    expect(slotProblems('CAR', s.fba.teams.CAR)).toEqual(['CAR: no C']);
    const extra = [...s.fba.teams.BOS, { ...s.fba.teams.BOS[2], playerId: 'p00032' }];
    expect(slotProblems('BOS', extra)).toEqual(['BOS: 2 players at SF']);
  });
  it('normalizes to position order with one vacancy per empty position', () => {
    const s = baseState();
    const withoutPg = s.fba.teams.BOS.filter(e => e.position !== 'PG');
    const out = normalizeRoster(withoutPg, 'fba');
    expect(out.map(e => [e.position, e.playerId])).toEqual([['PG', null], ['SG', 'p00002'], ['SF', 'p00003'], ['PF', 'p00004'], ['C', 'p00005']]);
    expect(out[0]).toEqual(vacantEntry('PG', 'fba'));
    expect(vacantEntry('PG', 'fbad2')).toEqual({ playerId: null, position: 'PG', rating: null, age: null, points: 0 });
  });
});

describe('state helpers', () => {
  it('builds document paths', () => {
    expect(docPath('freeAgents', 79)).toBe('leagues/fba/S79/freeAgents.json');
    expect(docPath('d2Tx', 79)).toBe('leagues/fbad2/S79/transactions.json');
    expect(docPath('picks', 79)).toBe('leagues/fba/picks.json');
  });
  it('finds players and appends numbered transactions', () => {
    const s = baseState();
    expect(findOnRoster(s.d2, 'p00023')).toMatchObject({ teamId: 'AMS', index: 3 });
    const tx = appendTx(appendTx(s.fbaTx, { batchId: 'b1' }, 'edit', ['BOS'], ['x']), { batchId: 'b2' }, 'cut', ['BOS'], ['y']);
    expect(tx.entries.map(e => [e.seq, e.batchId, e.type])).toEqual([[1, 'b1', 'edit'], [2, 'b2', 'cut']]);
  });
});
