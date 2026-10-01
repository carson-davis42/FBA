import { describe, it, expect } from 'vitest'
import { deriveRosters, GENERATED_AGE } from './roster'
import { mulberry32 } from '../d2/random'
import type { Position, RosterEntry, RostersFile } from '../shared/types'

const POS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']
const p = (playerId: string | null, position: Position, rating: number | null, age: number): RosterEntry => ({
  playerId, position, rating, age, points: 0,
})
const file = (teams: Record<string, RosterEntry[]>, league: 'fbad2' | 'fbawc' = 'fbad2'): RostersFile => ({
  league, season: 78, locked: false, teams,
})

const d2 = file({
  LON: [p('p00001', 'PG', 80, 25), p('p00002', 'SG', 70, 25), p('p00003', 'SF', 75, 30), p('p00004', 'PF', 60, 22), p('p00005', 'C', 90, 28)],
  MAN: [p('p00006', 'PG', 80, 24), p('p00007', 'SG', 85, 31), p('p00008', 'SF', 75, 30), p('p00009', 'PF', 60, 22), p('p00010', 'C', 88, 20)],
  MIL: [p('p00011', 'PG', 77, 27), p('p00012', 'SG', 78, 27), p('p00013', 'C', null, 27)],
})
const countries = ['ENG', 'ALG', 'ITA']
const input = (over: object = {}) => ({ countries, d2Rosters: d2, mode: 'qualifying' as const, previous: null, ...over })

describe('deriveRosters qualifying', () => {
  it('picks the best per position with age then id tiebreaks', () => {
    const eng = deriveRosters(input(), mulberry32(1)).ENG
    expect(eng.map((x) => x.position)).toEqual(POS)
    expect(eng.map((x) => x.playerId)).toEqual(['p00006', 'p00007', 'p00003', 'p00004', 'p00005'])
    expect(eng.every((x) => x.points === 0)).toBe(true)
  })
  it('generates five for a country with no cities', () => {
    const alg = deriveRosters(input(), mulberry32(1)).ALG
    expect(alg.map((x) => x.position)).toEqual(POS)
    for (const x of alg) {
      expect(x.playerId).toBeNull()
      expect(x.rating!).toBeGreaterThanOrEqual(65)
      expect(x.rating!).toBeLessThanOrEqual(74)
      expect(x.age).toBe(GENERATED_AGE)
    }
  })
  it('generates only missing positions (null rating skipped)', () => {
    const ita = deriveRosters(input(), mulberry32(1)).ITA
    expect(ita.map((x) => x.playerId).slice(0, 2)).toEqual(['p00011', 'p00012'])
    expect(ita.filter((x) => x.playerId === null)).toHaveLength(3)
  })
  it('is deterministic per seed and differs across seeds', () => {
    const a = deriveRosters(input(), mulberry32(5))
    expect(deriveRosters(input(), mulberry32(5))).toEqual(a)
    const r = (s: number) => deriveRosters(input(), mulberry32(s)).ALG.map((x) => x.rating)
    expect(r(5)).not.toEqual(r(6))
  })
  it('does not mutate inputs', () => {
    const inp = input()
    const before = JSON.stringify(inp)
    deriveRosters(inp, mulberry32(1))
    expect(JSON.stringify(inp)).toBe(before)
  })
})

describe('deriveRosters worldcup', () => {
  const prev = file({
    ALG: POS.map((pos, i) => p(null, pos, 66 + i, 31)),
    ITA: [p('p00011', 'PG', 77, 26), p('p00012', 'SG', 78, 26), p(null, 'SF', 70, 31), p(null, 'PF', 71, 31)],
  }, 'fbawc')
  it('carries generated players over with age +1 and the same rating', () => {
    const alg = deriveRosters(input({ mode: 'worldcup', previous: prev }), mulberry32(1)).ALG
    expect(alg.map((x) => x.rating)).toEqual([66, 67, 68, 69, 70])
    expect(alg.every((x) => x.playerId === null && x.age === 32)).toBe(true)
  })
  it('a real player replaces the generated slot', () => {
    const d2b = file({ ...d2.teams, LON: [p('p00099', 'PG', 50, 40)] })
    const alg = deriveRosters(input({ mode: 'worldcup', previous: prev, countries: ['ENG', 'ALG'], d2Rosters: d2b }), mulberry32(1))
    expect(alg.ENG[0].playerId).toBe('p00006')
    const prev2 = file({ ENG: POS.map((pos) => p(null, pos, 70, 31)) }, 'fbawc')
    const eng = deriveRosters(input({ mode: 'worldcup', previous: prev2 }), mulberry32(1)).ENG
    expect(eng[0].playerId).toBe('p00006')
    expect(eng[4].playerId).toBe('p00005')
  })
  it('draws fresh (age 31) when previous lacks one', () => {
    const ita = deriveRosters(input({ mode: 'worldcup', previous: prev }), mulberry32(1)).ITA
    expect(ita[2].rating).toBe(70)
    expect(ita[2].age).toBe(32)
    expect(ita[4].playerId).toBeNull()
    expect(ita[4].age).toBe(GENERATED_AGE)
    expect(ita[4].rating!).toBeGreaterThanOrEqual(65)
  })
  it('does not mutate previous', () => {
    const before = JSON.stringify(prev)
    deriveRosters(input({ mode: 'worldcup', previous: prev }), mulberry32(1))
    expect(JSON.stringify(prev)).toBe(before)
  })
})
