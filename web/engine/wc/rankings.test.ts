import { describe, expect, it } from 'vitest'
import type { RosterEntry } from '../shared/types'
import { wcRankings } from './rankings'

const entry = (position: RosterEntry['position'], rating: number | null, playerId: string | null = 'p1'): RosterEntry => ({ playerId, position, rating, age: 25, points: 0 })
const roster = (...r: (number | null)[]): RosterEntry[] => (['PG', 'SG', 'SF', 'PF', 'C'] as const).map((p, i) => entry(p, r[i] ?? null))

describe('wcRankings', () => {
  it('orders by country rating, high to low, with ties sharing a rank and the next rank skipping', () => {
    const rows = wcRankings(['BRA', 'ARG', 'FRA', 'ESP'], {
      BRA: roster(80, 80, 80, 80, 80), ARG: roster(70, 70, 70, 70, 70), FRA: roster(70, 70, 70, 70, 70), ESP: roster(60, 60, 60, 60, 60),
    })
    expect(rows.map(r => [r.teamId, r.rank, r.rating])).toEqual([['BRA', 1, 80], ['ARG', 2, 70], ['FRA', 2, 70], ['ESP', 4, 60]])
  })
  it('gives a run of three or more tied countries the same rank', () => {
    const r = roster(60, 60, 60, 60, 60)
    const rows = wcRankings(['A', 'B', 'C', 'D', 'E'], { A: roster(70, 70, 70, 70, 70), B: r, C: r, D: r, E: roster(50, 50, 50, 50, 50) })
    expect(rows.map(x => [x.teamId, x.rank])).toEqual([['A', 1], ['B', 2], ['C', 2], ['D', 2], ['E', 5]])
  })
  it('lists the slot ratings by position and counts generated players', () => {
    const r = [entry('PG', 70), entry('SG', 71, null), entry('SF', 72), entry('PF', 73, null), entry('C', null, null)]
    const [row] = wcRankings(['X'], { X: [r[4], r[1], r[3], r[0], r[2]] })
    expect(row.slots).toEqual([70, 71, 72, 73, null])
    expect(row.generated).toBe(3)
  })
  it('ranks a country with no roster last at 0', () => {
    const rows = wcRankings(['A', 'B'], { A: roster(50, 50, 50, 50, 50) })
    expect(rows.map(r => [r.teamId, r.rank, r.rating, r.slots])).toEqual([['A', 1, 50, [50, 50, 50, 50, 50]], ['B', 2, 0, [null, null, null, null, null]]])
  })
})
