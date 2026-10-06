import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../d2/random'
import type { Position, RosterEntry } from '../shared/types'
import { simTeam, simWcGame } from './state'

const POS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']
const full = (rating = 70): RosterEntry[] => POS.map((position, i) => ({ playerId: `p0000${i + 1}`, position, rating, age: 25, points: 0 }))
const next = { gameNo: 1, home: 'USA', away: 'ENG' }

describe('World Cup lineups', () => {
  it('uses the roster as it is, with a generated player (no id) keeping his own rating', () => {
    const roster = full().map(e => (e.position === 'C' ? { ...e, playerId: null, rating: 66 } : e))
    const t = simTeam('USA', roster)
    expect(t.players.map(p => p.position)).toEqual(POS)
    expect(t.players[4]).toEqual({ playerId: 'USA:C', position: 'C', rating: 66 })
  })

  it('refuses to play a game rather than invent a rating-0 player for a missing position', () => {
    const missing = full().filter(e => e.position !== 'C')
    expect(simWcGame({ teams: { USA: missing, ENG: full() } }, next, mulberry32(1))).toBe('USA has no rated C')
  })

  it('refuses a null rating the same way', () => {
    const unrated = full().map(e => (e.position === 'PG' ? { ...e, rating: null } : e))
    expect(simWcGame({ teams: { USA: full(), ENG: unrated } }, next, mulberry32(1))).toBe('ENG has no rated PG')
  })

  it('sims a game between two complete rosters', () => {
    const g = simWcGame({ teams: { USA: full(75), ENG: full(70) } }, next, mulberry32(1))
    expect(typeof g).toBe('object')
  })
})
