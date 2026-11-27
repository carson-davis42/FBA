import { describe, expect, it } from 'vitest'
import type { PlayerBiosFile, PlayersFile, RostersFile, TeamsFile } from '../shared/types'
import { newBio, recordSchoolSeason, schoolEntries, withSchoolSeason } from './bios'

const teams = {
  league: 'fbajc', teams: [{ teamId: 'BYU', name: 'BYU' }, { teamId: 'KU', name: 'Kansas' }, { teamId: 'UL', name: 'Louisville' }],
} as unknown as TeamsFile
const bio = (...entries: string[]) => ({ playerId: 'p00001', born: 'Born-S61', entries })
const at = (teamId: string, entries: string[], season = 80) => withSchoolSeason(bio(...entries), teamId, season, teams).entries

describe('newBio', () => {
  it('has the birth season and no stints yet', () => {
    expect(newBio('p00001', 62)).toEqual({ playerId: 'p00001', born: 'Born-S62', entries: [] })
  })
})

describe('withSchoolSeason', () => {
  it('adds the school to a bio with none', () => {
    expect(at('BYU', [])).toEqual(['BYU-S80-pres.'])
  })

  it('leaves a bio already open at the school unchanged, however it spells it', () => {
    const kept = bio('Lousiville-S79-pres.', '1x POY')
    expect(withSchoolSeason(kept, 'UL', 80, teams)).toBe(kept)
  })

  it('closes the old school at the season before and adds the new one after its honours', () => {
    expect(at('BYU', ['Kansas-S78-pres.', '1x NC app.'])).toEqual(['Kansas-S78-S79', '1x NC app.', 'BYU-S80-pres.'])
    expect(at('BYU', ['Kansas-S79-pres.'])).toEqual(['Kansas-S79', 'BYU-S80-pres.'])
  })

  it('reopens a stint at the same school that ended the season before', () => {
    expect(at('KU', ['Kansas-S78-S79'])).toEqual(['Kansas-S78-pres.'])
    expect(at('KU', ['Kansas-S79'])).toEqual(['Kansas-S79-pres.'])
  })

  it('starts a new stint after a school left more than a season ago', () => {
    expect(at('KU', ['Kansas-S77', 'BYU-S78'])).toEqual(['Kansas-S77', 'BYU-S78', 'Kansas-S80-pres.'])
  })

  it("leaves alone an open school it can't match, and a stint that starts later", () => {
    for (const entries of [['Somewhere Tech-S79-pres.'], ['Kansas-S81-pres.']]) expect(at('BYU', entries)).toEqual(entries)
  })
})

describe('schoolEntries', () => {
  const roster = (season: number, teamId: string): RostersFile =>
    ({ league: 'fbajc', season, locked: true, teams: { [teamId]: [{ playerId: 'p00001', position: 'PG', rating: 70, age: null, points: 0 }] } })

  it('is one stint from the freshman season when no earlier roster says otherwise', () => {
    expect(schoolEntries('p00001', 'BYU', 80, 2, [], teams)).toEqual(['BYU-S78-pres.'])
  })

  it('lists an earlier school from the past rosters, filling a season with no roster from the next one known', () => {
    expect(schoolEntries('p00001', 'BYU', 80, 3, [roster(79, 'BYU'), roster(78, 'KU')], teams)).toEqual(['Kansas-S77-S78', 'BYU-S79-pres.'])
    expect(schoolEntries('p00001', 'BYU', 80, 1, [roster(79, 'KU')], teams)).toEqual(['Kansas-S79', 'BYU-S80-pres.'])
  })
})

describe('recordSchoolSeason', () => {
  const players: PlayersFile = {
    nextId: 5,
    players: {
      p00001: { id: 'p00001', name: 'Has Bio', birthSeason: 61 },
      p00002: { id: 'p00002', name: 'No Bio', birthSeason: 62 },
      p00003: { id: 'p00003', name: 'No Birth', birthSeason: null },
      p00004: { id: 'p00004', name: null, birthSeason: 62 },
    },
  }
  const entry = (playerId: string | null, classYear: 'Fr' | 'So' = 'Fr') => ({ playerId, position: 'PG' as const, rating: 70, age: null, points: 0, classYear })
  const rosters: RostersFile = {
    league: 'fbajc', season: 80, locked: false,
    teams: { BYU: [entry('p00001', 'So'), entry('p00002'), entry('p00003', 'So'), entry('p00004'), entry(null)] },
  }
  const bios: PlayerBiosFile = { league: 'fba', bios: [bio('BYU-S79-pres.')] }

  it('gives every named player on the rosters a bio with the school, and nobody unnamed', () => {
    expect(recordSchoolSeason(bios, players, rosters, teams, 80)!.bios).toEqual([
      bio('BYU-S79-pres.'),
      { playerId: 'p00002', born: 'Born-S62', entries: ['BYU-S80-pres.'] },
      { playerId: 'p00003', born: 'Born-S61', entries: ['BYU-S80-pres.'] },
    ])
  })

  it('is null when nothing changes', () => {
    const done = recordSchoolSeason(bios, players, rosters, teams, 80)!
    expect(recordSchoolSeason(done, players, rosters, teams, 80)).toBeNull()
  })
})
