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

/** The roster ratings from best to worst (an empty or unrated slot counts as 0). */
const bestFirst = (slots: (number | null)[]) => slots.map(v => v ?? 0).sort((a, b) => b - a)

/** Compares two best-first rating lists: the better best player wins, then the second best, and so on. 0 when they are identical. */
function byPlayers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Every country ranked by its country rating, highest first. A tie is broken by the best player, then the second best, and so on; countries
 * whose five ratings are all identical stay tied (they share a rank and are listed by id so the list is stable).
 */
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
  const order = new Map(rows.map(r => [r.teamId, bestFirst(r.slots)]))
  const same = (a: string, b: string) => byPlayers(order.get(a)!, order.get(b)!) === 0
  rows.sort((a, b) => b.rating - a.rating || byPlayers(order.get(a.teamId)!, order.get(b.teamId)!) || a.teamId.localeCompare(b.teamId))
  const out: WcRankRow[] = []
  rows.forEach((r, i) => out.push({ ...r, rank: i > 0 && out[i - 1].rating === r.rating && same(out[i - 1].teamId, r.teamId) ? out[i - 1].rank : i + 1 }))
  return out
}
