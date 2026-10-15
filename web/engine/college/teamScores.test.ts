import { describe, expect, it } from 'vitest'
import type { PortalPlayer, Prospect, RecruitingFile } from '../shared/types'
import { POINTS_BASELINE, prospectPoints, rankScores, teamRecruitingScores } from './teamScores'

const recruit = (playerId: string, rating: number | null, stars: 3 | 4 | 5 | null, committedTo: string | null): Prospect =>
  ({ playerId, position: 'PG', classYear: 'Fr', rating, stars, projections: {}, committedTo })
const transfer = (playerId: string, rating: number | null, stars: 3 | 4 | 5 | null, committedTo: string | null): PortalPlayer =>
  ({ ...recruit(playerId, rating, stars, committedTo), classYear: 'So', fromTeam: 'ZZZ' })
const board = (recruits: Prospect[], portal: PortalPlayer[]): RecruitingFile => ({
  league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true, recruits, portal,
})

describe('prospectPoints', () => {
  it('is the rating above the baseline, never negative, and nothing without a rating', () => {
    expect(POINTS_BASELINE).toBe(60)
    expect([94, 80, 60, 55].map(prospectPoints)).toEqual([34, 20, 0, 0])
    expect(prospectPoints(null)).toBe(0)
  })
})

describe('teamRecruitingScores', () => {
  const b = board(
    [recruit('p1', 94, 5, 'AAA'), recruit('p2', 80, 4, 'AAA'), recruit('p3', 76, 3, 'BBB'), recruit('p4', 90, 5, null)],
    [transfer('p5', 85, 4, 'BBB'), transfer('p6', null, null, 'CCC')],
  )
  const rows = () => Object.fromEntries(teamRecruitingScores(b, ['AAA', 'BBB', 'CCC', 'DDD']).map(r => [r.teamId, r]))

  it('scores the class, the portal and both together from committed players only', () => {
    const { AAA, BBB } = rows()
    expect(AAA.class).toMatchObject({ count: 2, points: 34 + 20, avg: 87, stars: { five: 1, four: 1, three: 0 } })
    expect(AAA.portal.count).toBe(0)
    expect(AAA.combined).toMatchObject({ count: 2, points: 54 })
    expect(BBB.class).toMatchObject({ count: 1, points: 16, avg: 76 })
    expect(BBB.portal).toMatchObject({ count: 1, points: 25, avg: 85 })
    expect(BBB.combined).toMatchObject({ count: 2, points: 41, avg: 80.5, stars: { five: 0, four: 1, three: 1 } })
  })

  it('counts an unrated commit but gives it nothing, and lists schools with no commits', () => {
    const { CCC, DDD } = rows()
    expect(CCC.portal).toMatchObject({ count: 1, points: 0, avg: null, unrated: 1 })
    expect(DDD.combined).toMatchObject({ count: 0, points: 0, avg: null })
  })
})

describe('rankScores', () => {
  const b = board([recruit('p1', 90, 5, 'AAA'), recruit('p2', 90, 5, 'BBB'), recruit('p3', 70, 3, 'CCC'), recruit('p4', 70, 3, 'CCC')], [])
  it('orders by points, then average, and equal schools share a rank', () => {
    const ranked = rankScores(teamRecruitingScores(b, ['AAA', 'BBB', 'CCC']), 'class')
    expect(ranked.map(r => [r.score.teamId, r.rank])).toEqual([['AAA', 1], ['BBB', 1], ['CCC', 3]])
  })
  it('ranks each score on its own', () => {
    const withPortal = board(b.recruits, [transfer('p5', 99, 5, 'CCC')])
    const scores = teamRecruitingScores(withPortal, ['AAA', 'BBB', 'CCC'])
    expect(rankScores(scores, 'portal')[0].score.teamId).toBe('CCC')
    expect(rankScores(scores, 'combined')[0].score.teamId).toBe('CCC')
    expect(rankScores(scores, 'class')[0].score.teamId).toBe('AAA')
  })
})
