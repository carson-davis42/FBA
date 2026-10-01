import type { RosterEntry } from '../shared/types'

/** Country rating: the average of the five roster ratings (a null rating counts as 0). */
export function countryRating(roster: RosterEntry[]): number {
  if (roster.length === 0) return 0
  return roster.reduce((sum, r) => sum + (r.rating ?? 0), 0) / roster.length
}
