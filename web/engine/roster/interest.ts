import { marketRows } from './market';
import { CAP, isExpired, payroll } from './rules';
import { marketAmount } from './tradeValue';
import { nameOf, type RosterState } from './state';

/** How much better a free agent must be than the player a team holds at his position for it to be interested anyway. */
export const UPGRADE_MARGIN = 5;

export interface InterestedTeam {
  teamId: string;
  /** `resign`: his own team, whose contract with him has ended. `need`: nobody holds his position. `upgrade`: he is clearly better than the holder. */
  reason: 'resign' | 'need' | 'upgrade';
  holder: { playerId: string; name: string; rating: number | null } | null;
  /** Cap room: the cap less the contracts that still run. */
  room: number;
  /** What a typical contract for his rating costs; null while he has no FBA rating (a D2 player). */
  ask: number | null;
  /** The room covers the typical ask (or the $1 minimum when there is no ask yet). */
  affordable: boolean;
}

const ORDER = { resign: 0, need: 1, upgrade: 2 } as const;

/**
 * The teams that would be interested in a player on the market: the team he is leaving, teams with nobody at his position, and teams that
 * hold someone clearly worse. A team needs at least $1 of cap room; an upgrade must also fit the typical ask. Affordable teams come first.
 */
export function interestedTeams(state: RosterState, playerId: string): InterestedTeam[] {
  const row = marketRows(state).find(r => r.playerId === playerId);
  if (!row) return [];
  const ask = row.scale === 'FBA' && row.rating !== null ? Math.max(1, Math.round(marketAmount(row.rating))) : null;
  const out: InterestedTeam[] = [];
  for (const [teamId, entries] of Object.entries(state.fba.teams)) {
    const room = CAP - payroll(entries, state.season);
    if (room < 1) continue;
    const affordable = room >= (ask ?? 1);
    if (row.from === teamId && row.type === 'Expired') {
      out.push({ teamId, reason: 'resign', holder: null, room, ask, affordable });
      continue;
    }
    // Players whose contracts ended leave with the market; a restricted one is a team option and still holds the spot.
    const holder = entries.find(e => e.playerId !== null && e.position === row.position && e.playerId !== playerId && !(isExpired(e, state.season) && !e.restricted));
    if (!holder) {
      out.push({ teamId, reason: 'need', holder: null, room, ask, affordable });
    } else if (row.scale === 'FBA' && row.rating !== null && holder.rating !== null && row.rating >= holder.rating + UPGRADE_MARGIN && affordable) {
      out.push({ teamId, reason: 'upgrade', holder: { playerId: holder.playerId!, name: nameOf(state, holder.playerId!), rating: holder.rating }, room, ask, affordable });
    }
  }
  return out.sort((a, b) => Number(b.affordable) - Number(a.affordable) || ORDER[a.reason] - ORDER[b.reason] || b.room - a.room || a.teamId.localeCompare(b.teamId));
}
