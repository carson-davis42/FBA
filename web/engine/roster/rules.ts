import type { Position, RosterEntry } from '../shared/types';

export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export const CAP = 25;
/** Hard payroll ceiling for trades and own-player re-signings; every other move stays under CAP. */
export const TRADE_CAP = 27;
export const MAX_AMOUNT = 8;
export const MAX_YEARS_NEW = 4;
export const MAX_YEARS_RESIGN = 5;
/** Players retire after the season in which they play at this age. */
export const RETIRE_AGE = 32;

export type ContractKind = 'new' | 'resign' | 'rookie';

export function isExpired(e: RosterEntry, season: number): boolean {
  return e.playerId !== null && e.contractEnd !== null && e.contractEnd !== undefined && e.contractEnd < season;
}

export function payroll(entries: RosterEntry[], season: number): number {
  return entries.reduce((sum, e) => {
    const active = e.playerId !== null && e.contractEnd !== null && e.contractEnd !== undefined && e.contractEnd >= season;
    return sum + (active ? e.contractAmount ?? 0 : 0);
  }, 0);
}

export function contractEndFor(season: number, years: number): number {
  return season + years - 1;
}

export function contractProblems(t: { years: number; amount: number }, kind: ContractKind): string[] {
  const p: string[] = [];
  const yearsOk = Number.isInteger(t.years) && t.years >= 1;
  const amountOk = Number.isInteger(t.amount) && t.amount >= 1;
  if (!yearsOk) p.push('Years must be a whole number, at least 1');
  if (!amountOk) p.push('Amount must be a whole number of dollars, at least $1');
  if (!yearsOk || !amountOk) return p;
  if (kind === 'rookie') {
    if (!((t.years === 1 && t.amount === 1) || (t.years === 2 && t.amount === 2))) p.push('Rookie contracts are 1/$1 or 2/$2');
    return p;
  }
  if (t.amount > MAX_AMOUNT) p.push(`Amount can't exceed $${MAX_AMOUNT}`);
  const maxYears = kind === 'resign' ? MAX_YEARS_RESIGN : MAX_YEARS_NEW;
  if (t.years > maxYears) p.push(`${kind === 'resign' ? 'Re-signings' : 'New signings'} are limited to ${maxYears} years`);
  if (t.years > t.amount) p.push(`Years can't exceed dollars (${t.years} years needs at least $${t.years})`);
  return p;
}

export function capProblem(total: number, cap: number = CAP): string | null {
  return total > cap ? `Payroll would be $${total} (cap $${cap})` : null;
}

export function slotProblems(teamId: string, entries: RosterEntry[]): string[] {
  const p: string[] = [];
  for (const pos of POSITIONS) {
    const n = entries.filter(e => e.position === pos && e.playerId !== null).length;
    if (n === 0) p.push(`${teamId}: no ${pos}`);
    if (n > 1) p.push(`${teamId}: ${n} players at ${pos}`);
  }
  return p;
}

export function vacantEntry(position: Position, league: 'fba' | 'fbad2'): RosterEntry {
  const e: RosterEntry = { playerId: null, position, rating: null, age: null, points: 0 };
  if (league === 'fba') {
    e.contractEnd = null;
    e.contractAmount = null;
  }
  return e;
}

/** Orders entries PG→C, keeps every player, and leaves exactly one vacant entry for each position with no player. */
export function normalizeRoster(entries: RosterEntry[], league: 'fba' | 'fbad2'): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const pos of POSITIONS) {
    const filled = entries.filter(e => e.position === pos && e.playerId !== null);
    out.push(...(filled.length ? filled : [vacantEntry(pos, league)]));
  }
  return out;
}
