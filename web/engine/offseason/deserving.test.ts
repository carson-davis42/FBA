import { describe, expect, it } from 'vitest'
import { parseBio } from '../history/career'
import type { AwardCountsFile, HallOfFameFile, PlayerBio } from '../shared/types'
import { deserving, fbaSeasons, rankCandidates } from './deserving'
import type { Candidate } from './hallOfFame'

const cand = (n: number, name: string, season = 70): Candidate => ({ playerId: `p0000${n}`, name, retired: { season, league: 'fba', teamId: 'BOS', position: 'PG' } as Candidate['retired'] })
const baseline = (counts: [number, string, number][]): AwardCountsFile => ({
  league: 'fba', throughSeason: 78, counts: counts.map(([n, key, count]) => ({ playerId: `p0000${n}`, key: key as never, count })),
})
const bios: Record<string, PlayerBio> = {}
const bio = (n: number, entries: string[]) => { bios[`p0000${n}`] = { playerId: `p0000${n}`, born: 'Born-S40', entries } as PlayerBio }
const bioOf = (id: string) => bios[id] ?? null
const hof = null as HallOfFameFile | null

describe('fbaSeasons', () => {
  it('counts FBA stints only, a pres. stint to the retirement season, and ";" ranges separately', () => {
    const c = parseBio({ born: 'Born-S40', entries: ['Duke-S60-S63', 'BOS-S64-S66', 'DEN-S67-pres.', 'ATL-S50-S51;S53'] })
    expect(fbaSeasons(c, 70)).toBe(3 + 4 + 2 + 1)
  })
})

describe('deserving', () => {
  it('weights awards by prestige and splits personal from team honours', () => {
    const c = parseBio({ born: 'Born-S40', entries: ['BOS-S60-S64'] })
    expect(deserving({ MVP: 2, ALL_STAR: 3, CHAMPION: 1, CSHIP_APP: 1 }, c, 64)).toEqual({ personal: 2 * 10 + 3 * 2, team: 5 + 2, seasons: 5 })
  })
})

describe('rankCandidates', () => {
  it('puts personal awards before team awards before length of career, and keeps the incoming order for exact ties', () => {
    bio(1, ['BOS-S50-S52']); bio(2, ['BOS-S40-S60']); bio(3, ['BOS-S50-S58']); bio(4, ['BOS-S50-S52']); bio(5, ['BOS-S50-S52'])
    const list = [cand(1, 'Champ'), cand(2, 'Iron Man'), cand(3, 'Star'), cand(4, 'Twin A'), cand(5, 'Twin B')]
    const ranked = rankCandidates(list, baseline([[3, 'MVP', 1], [1, 'CHAMPION', 4], [4, 'CHAMPION', 4], [5, 'CHAMPION', 4]]), [], bioOf, hof)
    // Star: personal 10. Champ, Twin A, Twin B: team 20, 3 seasons each (tie, original order). Iron Man: nothing but 21 seasons.
    expect(ranked.map(r => r.candidate.name)).toEqual(['Star', 'Champ', 'Twin A', 'Twin B', 'Iron Man'])
  })
  it('a long career with no honours ranks below a short career with one personal award', () => {
    bio(1, ['BOS-S30-S60']); bio(2, ['BOS-S58-S59'])
    const ranked = rankCandidates([cand(1, 'Long'), cand(2, 'Short')], baseline([[2, 'YOUNG_STAR', 1]]), [], bioOf, hof)
    expect(ranked.map(r => r.candidate.name)).toEqual(['Short', 'Long'])
  })
})
