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

/** A player whose contract has ended and who is not a restricted rookie, and who is already replaced at his position, if he is. */
export interface ExpiringRow {
  entry: RosterEntry;
  /** Someone under contract at his position: a reason to let him go. Null when nobody else holds the spot. */
  replacedBy: RosterEntry | null;
}

export interface TrimTeam {
  /** The players who can be cut, in position order. */
  rows: TrimRow[];
  /** Every player whose contract has ended (and who is not a restricted rookie): release him, or leave him to re-sign or test free agency. */
  expiring: ExpiringRow[];
}

/** A player whose contract has ended and who is not a restricted rookie: he may re-sign or go to the market. */
export const isTestingFa = (e: RosterEntry, season: number) => isExpired(e, season) && !e.restricted;

/**
 * Who a team may want to cut before free agency: both players of a position held twice (an ended rookie contract is a team option and still
 * holds the spot; an ended veteran contract does not), and any rookie (restricted contract) rated 65 or lower. Players with ended contracts are listed
 * apart, to release or leave alone, with who already holds their position.
 */
export function trimCandidates(entries: RosterEntry[], season: number): TrimTeam {
  const rows: TrimRow[] = [];
  const expiring: ExpiringRow[] = [];
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
    for (const entry of here.filter(e => isTestingFa(e, season))) expiring.push({ entry, replacedBy: holders[0] ?? null });
  }
  return { rows, expiring };
}

/** Every FBA team with someone to consider cutting, in team order. */
export function trimTeams(state: RosterState): ({ teamId: string } & TrimTeam)[] {
  return Object.entries(state.fba.teams)
    .map(([teamId, entries]) => ({ teamId, ...trimCandidates(entries, state.season) }))
    .filter(t => t.rows.length > 0 || t.expiring.length > 0);
}
