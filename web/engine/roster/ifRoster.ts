import type { RosterEntry } from '../shared/types';
import type { SeasonPhase } from '../season/locks';
import { contractEndFor, normalizeRoster, payroll } from './rules';
import { marketRows } from './market';
import { signPlayer, type SignInput } from './moves';
import type { RosterState } from './state';

export interface IfRoster {
  /** The team's roster as it would be after the signing; the signed player is `newId`. */
  entries: RosterEntry[];
  newId: string;
  /** Players who would leave: the one displaced at his position when the choice is to release or cut him. */
  leaving: RosterEntry[];
  payroll: number;
  /** The signing is allowed as typed; false shows the roster anyway, with the problems. */
  ok: boolean;
  problems: string[];
}

/**
 * The roster a team would have if it signed a market player on these terms, for showing before anyone commits. A signing that is not
 * allowed yet (cap, a missing rating, a years/dollars mismatch) still gets a roster, built from the same terms, plus the problems.
 */
export function ifRoster(state: RosterState, input: SignInput, phase?: SeasonPhase): IfRoster | null {
  const team = state.fba.teams[input.teamId];
  const row = marketRows(state).find(r => r.playerId === input.playerId);
  const own = Object.values(state.fba.teams).flat().find(e => e.playerId === input.playerId);
  const position = row?.position ?? own?.position;
  if (!team || !position) return null;
  const result = signPlayer(state, input, { batchId: 'preview', phase });
  const before = team.filter(e => e.playerId !== null);
  if (result.ok) {
    const entries = result.state.fba.teams[input.teamId].filter(e => e.playerId !== null);
    const kept = new Set(entries.map(e => e.playerId));
    return { entries, newId: input.playerId, leaving: before.filter(e => !kept.has(e.playerId)), payroll: payroll(entries, state.season), ok: true, problems: [] };
  }
  const rating = input.rating ?? row?.rating ?? own?.rating ?? null;
  const age = row?.age ?? own?.age ?? null;
  const occupant = before.find(e => e.position === position && e.playerId !== input.playerId);
  const displaced = occupant && input.conflict !== 'keep' ? occupant : null;
  const added: RosterEntry = { playerId: input.playerId, position, rating, age, points: 0, contractEnd: contractEndFor(state.season, input.years), contractAmount: input.amount };
  const entries = normalizeRoster([...before.filter(e => e.playerId !== input.playerId && e !== displaced), added], 'fba').filter(e => e.playerId !== null);
  return { entries, newId: input.playerId, leaving: displaced ? [displaced] : [], payroll: payroll(entries, state.season), ok: false, problems: result.problems };
}
