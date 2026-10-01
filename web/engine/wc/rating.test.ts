import { describe, it, expect } from 'vitest'
import { countryRating } from './rating'
import type { RosterEntry } from '../shared/types'

const e = (rating: number | null): RosterEntry => ({ playerId: null, position: 'PG', rating, age: 25, points: 0 })

describe('countryRating', () => {
  it('averages the five ratings', () => {
    expect(countryRating([70, 72, 68, 74, 66].map(e))).toBe(70)
  })
  it('counts a null rating as 0', () => {
    expect(countryRating([70, 70, 70, 70, null].map(e))).toBe(56)
  })
})
