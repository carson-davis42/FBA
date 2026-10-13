import type { Position, RosterEntry } from '../shared/types'
import { countryRating } from './rating'

export const WC_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']

export interface WcRankRow {
  teamId: string
  /** Competition rank: countries on the same rating share a rank, the next rank skips. */
  rank: number
  rating: number
  /** The roster rating at PG, SG, SF, PF, C (null when the slot is empty or unrated). */
  slots: (number | null)[]
  /** Roster slots filled by a generated player (no playerId). */
  generated: number
}

/** Every country ranked by its country rating, highest first; ties are ordered by id so the list is stable. */
export function wcRankings(teamIds: string[], rosters: Record<string, RosterEntry[]>): WcRankRow[] {
  const rows = teamIds.map(teamId => {
    const roster = rosters[teamId] ?? []
    return {
      teamId,
      rating: countryRating(roster),
      slots: WC_POSITIONS.map(p => roster.find(e => e.position === p)?.rating ?? null),
      generated: roster.filter(e => e.playerId === null).length,
    }
  })
  rows.sort((a, b) => b.rating - a.rating || a.teamId.localeCompare(b.teamId))
  return rows.map((r, i) => ({ ...r, rank: i > 0 && rows[i - 1].rating === r.rating ? 0 : i + 1 }))
    .map((r, i, all) => ({ ...r, rank: r.rank === 0 ? all[i - 1].rank : r.rank }))
}
