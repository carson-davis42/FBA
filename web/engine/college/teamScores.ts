import type { PortalPlayer, Prospect, RecruitingFile } from '../shared/types'

/** A committed player earns his rating above this many points: a 94 is worth 34, an 80 is worth 20, anything at or under it nothing. */
export const POINTS_BASELINE = 60

export const prospectPoints = (rating: number | null): number => (rating === null ? 0 : Math.max(0, rating - POINTS_BASELINE))

export interface ScoreLine {
  /** Committed players. */
  count: number
  /** Sum of `prospectPoints`: more good players is a better class, so volume counts. */
  points: number
  /** Average rating of the committed players that have one; null when there are none. */
  avg: number | null
  /** Of those, how many are 5, 4 and 3 star. */
  stars: { five: number; four: number; three: number }
  /** Committed players with no rating yet (the class isn't ranked): they earn nothing until it is. */
  unrated: number
}

export interface TeamRecruitingScore {
  teamId: string
  class: ScoreLine
  portal: ScoreLine
  combined: ScoreLine
}

export type ScoreKind = 'class' | 'portal' | 'combined'

const empty = (): ScoreLine => ({ count: 0, points: 0, avg: null, stars: { five: 0, four: 0, three: 0 }, unrated: 0 })

function lineOf(players: (Prospect | PortalPlayer)[]): ScoreLine {
  const rated = players.filter(p => p.rating !== null)
  const stars = { five: 0, four: 0, three: 0 }
  for (const p of players) {
    if (p.stars === 5) stars.five++
    else if (p.stars === 4) stars.four++
    else if (p.stars === 3) stars.three++
  }
  return {
    count: players.length,
    points: players.reduce((n, p) => n + prospectPoints(p.rating), 0),
    avg: rated.length ? Math.round((rated.reduce((n, p) => n + p.rating!, 0) / rated.length) * 10) / 10 : null,
    stars,
    unrated: players.length - rated.length,
  }
}

/** Every school's recruiting score from the board's commitments: the new class, the transfer portal, and both together. */
export function teamRecruitingScores(board: RecruitingFile, teamIds: string[]): TeamRecruitingScore[] {
  const committed = (list: (Prospect | PortalPlayer)[]) => {
    const by = new Map<string, (Prospect | PortalPlayer)[]>()
    for (const p of list) if (p.committedTo) by.set(p.committedTo, [...(by.get(p.committedTo) ?? []), p])
    return by
  }
  const recruits = committed(board.recruits)
  const portal = committed(board.portal)
  const ids = new Set([...teamIds, ...recruits.keys(), ...portal.keys()])
  return [...ids].map(teamId => {
    const r = recruits.get(teamId) ?? []
    const p = portal.get(teamId) ?? []
    return { teamId, class: r.length ? lineOf(r) : empty(), portal: p.length ? lineOf(p) : empty(), combined: lineOf([...r, ...p]) }
  })
}

export interface RankedScore { score: TeamRecruitingScore; rank: number }

/** Schools best first for one score: points, then average rating, then name order of the id. Equal on all three share a rank. */
export function rankScores(scores: TeamRecruitingScore[], kind: ScoreKind): RankedScore[] {
  const sorted = [...scores].sort((a, b) =>
    b[kind].points - a[kind].points || (b[kind].avg ?? -1) - (a[kind].avg ?? -1) || a.teamId.localeCompare(b.teamId))
  const out: RankedScore[] = []
  sorted.forEach((score, i) => {
    const prev = out[i - 1]
    const same = prev && prev.score[kind].points === score[kind].points && prev.score[kind].avg === score[kind].avg
    out.push({ score, rank: same ? prev.rank : i + 1 })
  })
  return out
}
