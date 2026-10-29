import type { Position, RosterEntry } from '../shared/types';
import { isExpired, POSITIONS } from './rules';
import type { RosterState } from './state';

export interface TrimSpot {
  position: Position;
  /** Two or more players under contract (a restricted rookie with an ended contract is a team option and still holds the spot): the ones who can be cut. */
  holders: RosterEntry[];
  /** Players whose contracts have ended at this position: testing free agency, left alone. */
  expiring: RosterEntry[];
}

/** A player whose contract has ended and who is not a restricted rookie: he may re-sign or go to the market. */
export const isTestingFa = (e: RosterEntry, season: number) => isExpired(e, season) && !e.restricted;

/** The positions where a team has two or more players that hold the spot. An ended contract does not count towards a duplicate. */
export function duplicateSpots(entries: RosterEntry[], season: number): TrimSpot[] {
  return POSITIONS.flatMap(position => {
    const here = entries.filter(e => e.playerId !== null && e.position === position);
    const holders = here.filter(e => !isTestingFa(e, season));
    return holders.length >= 2 ? [{ position, holders, expiring: here.filter(e => isTestingFa(e, season)) }] : [];
  });
}

/** Every FBA team with a duplicate position, in team order. */
export function trimTeams(state: RosterState): { teamId: string; spots: TrimSpot[] }[] {
  return Object.entries(state.fba.teams)
    .map(([teamId, entries]) => ({ teamId, spots: duplicateSpots(entries, state.season) }))
    .filter(t => t.spots.length > 0);
}
