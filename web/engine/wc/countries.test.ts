import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CITY_COUNTRY, d2CitiesOf } from './countries'

const load = (p: string): { teams: { teamId: string }[] } => JSON.parse(readFileSync(p, 'utf8'))
const d2 = load('data/leagues/fbad2/teams.json').teams.map((t) => t.teamId)
const wc = new Set(load('data/leagues/fbawc/teams.json').teams.map((t) => t.teamId))

describe('CITY_COUNTRY', () => {
  it('has every D2 team and nothing else', () => {
    expect(Object.keys(CITY_COUNTRY).sort()).toEqual([...d2].sort())
    expect(Object.keys(CITY_COUNTRY)).toHaveLength(64)
  })
  it('maps to fbawc teams, 40 countries', () => {
    const vals = Object.values(CITY_COUNTRY)
    for (const v of vals) expect(wc.has(v)).toBe(true)
    expect(new Set(vals).size).toBe(40)
  })
  it('handles AUS/SYD', () => {
    expect(CITY_COUNTRY.AUS).toBe('USA')
    expect(CITY_COUNTRY.SYD).toBe('AUS')
  })
})

describe('d2CitiesOf', () => {
  it('returns sorted cities', () => {
    expect(d2CitiesOf('ITA')).toEqual(['FLO', 'MIL', 'NAP', 'ROME'])
    expect(d2CitiesOf('ALG')).toEqual([])
  })
})
