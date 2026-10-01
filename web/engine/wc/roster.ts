import type { Position, RosterEntry, RostersFile } from '../shared/types'
import { randInt, type Rng } from '../d2/random'
import { d2CitiesOf } from './countries'

export const GENERATED_AGE = 31

export interface DeriveInput {
  /** All 85 fbawc team ids. */
  countries: string[];
  /** The current season's FBAD2 rosters. */
  d2Rosters: RostersFile;
  mode: 'qualifying' | 'worldcup';
  /** Previous season's fbawc rosters (needed for 'worldcup' carry-over); null otherwise. */
  previous: RostersFile | null;
}

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']

function better(a: RosterEntry, b: RosterEntry): boolean {
  if (a.rating !== b.rating) return a.rating! > b.rating!
  if (a.age !== b.age) return (a.age ?? Infinity) < (b.age ?? Infinity)
  return (a.playerId as string) < (b.playerId as string)
}

function generated(position: Position, rng: Rng): RosterEntry {
  return { playerId: null, position, rating: randInt(rng, 65, 74), age: GENERATED_AGE, points: 0 }
}

export function deriveRosters(input: DeriveInput, rng: Rng): Record<string, RosterEntry[]> {
  const out: Record<string, RosterEntry[]> = {}
  for (const country of input.countries) {
    const candidates: RosterEntry[] = []
    for (const city of d2CitiesOf(country)) {
      for (const e of input.d2Rosters.teams[city] ?? []) {
        if (e.playerId !== null && e.rating !== null) candidates.push(e)
      }
    }
    out[country] = POSITIONS.map((position) => {
      let best: RosterEntry | null = null
      for (const e of candidates) {
        if (e.position === position && (best === null || better(e, best))) best = e
      }
      if (best) return { playerId: best.playerId, position, rating: best.rating, age: best.age, points: 0 }
      if (input.mode === 'worldcup') {
        const prev = input.previous?.teams[country]?.find((e) => e.position === position && e.playerId === null)
        if (prev) return { ...prev, age: (prev.age ?? GENERATED_AGE) + 1, points: 0 }
      }
      return generated(position, rng)
    })
  }
  return out
}
