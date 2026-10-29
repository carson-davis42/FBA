import type { Position, RosterEntry } from '../shared/types';
import { isExpired, POSITIONS } from './rules';
import type { RosterState } from './state';

/** A rookie rated at or below this is offered for a cut even when he is not a duplicate. */
export const LOW_ROOKIE_RATING = 65;

export type TrimReason = 'duplicate' | 'low-rookie';

export interface TrimRow {
  entry: RosterEntry;
  /** Why he is on the list: a second player at his position, a rookie rated 65 or lower, or both. */
  reasons: TrimReason[];
}

export interface TrimTeam {
  /** The players who can be cut, in position order. */
  rows: TrimRow[];
  /** Players whose contracts have ended at a position shown above (or that has a duplicate): testing free agency, left alone. */
  expiring: RosterEntry[];
}

/** A player whose contract has ended and who is not a restricted rookie: he may re-sign or go to the market. */
export const isTestingFa = (e: RosterEntry, season: number) => isExpired(e, season) && !e.restricted;

/**
 * Who a team may want to cut before free agency: both players of a position held twice (an ended rookie contract is a team option and still
 * holds the spot; an ended veteran contract does not), and any rookie (restricted contract) rated 65 or lower. Ended contracts are only listed
 * as testing free agency, never as a cut.
 */
export function trimCandidates(entries: RosterEntry[], season: number): TrimTeam {
  const rows: TrimRow[] = [];
  const expiring: RosterEntry[] = [];
  for (const position of POSITIONS as Position[]) {
    const here = entries.filter(e => e.playerId !== null && e.position === position);
    const holders = here.filter(e => !isTestingFa(e, season));
    const duplicate = holders.length >= 2;
    for (const entry of holders) {
      const reasons: TrimReason[] = [];
      if (duplicate) reasons.push('duplicate');
      if (entry.restricted === true && entry.rating !== null && entry.rating <= LOW_ROOKIE_RATING) reasons.push('low-rookie');
      if (reasons.length) rows.push({ entry, reasons });
    }
    if (duplicate) expiring.push(...here.filter(e => isTestingFa(e, season)));
  }
  return { rows, expiring };
}

/** Every FBA team with someone to consider cutting, in team order. */
export function trimTeams(state: RosterState): ({ teamId: string } & TrimTeam)[] {
  return Object.entries(state.fba.teams)
    .map(([teamId, entries]) => ({ teamId, ...trimCandidates(entries, state.season) }))
    .filter(t => t.rows.length > 0);
}
