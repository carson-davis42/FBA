import { parseBio } from '../history/career'
import type { PlayerBio, PlayerBiosFile, PlayersFile, RostersFile, TeamsFile } from '../shared/types'

export const BIOS_PATH = 'leagues/fba/playerBios.json'

/** Seasons a college player has already spent in college, by class year (a Fr is in his first). */
export const YEARS_IN: Record<string, number> = { Fr: 0, So: 1, Jr: 2, Sr: 3 }

/** Spellings in the older bios that differ from the school's name. */
const SPELLING: Record<string, string> = { lousiville: 'louisville' }

const schoolKey = (name: string): string => {
  const key = name.trim().toLowerCase()
  return SPELLING[key] ?? key
}

const schoolName = (teams: TeamsFile, teamId: string): string => teams.teams.find(t => t.teamId === teamId)?.name ?? teamId

/** A new player's bio: every player has one from the day he gets a name. His schools are added once he has one. */
export const newBio = (playerId: string, birthSeason: number): PlayerBio => ({ playerId, born: `Born-S${birthSeason}`, entries: [] })

/**
 * The bio with the school he played for in `season` on record: added when missing, the old school closed the season before when he moved.
 * The same object comes back when nothing changes. An open stint at a school that can't be matched is left for a person to sort out.
 */
export function withSchoolSeason(bio: PlayerBio, teamId: string, season: number, teams: TeamsFile): PlayerBio {
  const school = schoolName(teams, teamId)
  const idOf = new Map(teams.teams.map(t => [schoolKey(t.name), t.teamId]))
  const stints = bio.entries.flatMap((entry, at) => {
    const s = parseBio({ born: bio.born, entries: [entry] }).stints[0]
    return s && s.kind === 'college' ? [{ ...s, at }] : []
  })
  const last = stints[stints.length - 1]
  const added = `${school}-S${season}-pres.`
  if (!last) return { ...bio, entries: [...bio.entries, added] }
  if (last.from === null || last.from > season) return bio
  const here = idOf.get(schoolKey(last.team))
  const replace = (entry: string) => bio.entries.map((e, i) => (i === last.at ? entry : e))
  if (here === teamId) {
    if (last.to === 'pres' || (last.to !== null && last.to >= season)) return bio
    if (last.to === season - 1) return { ...bio, entries: replace(`${last.team}-S${last.from}-pres.`) }
    return { ...bio, entries: [...bio.entries, added] }
  }
  if (last.to !== 'pres') return { ...bio, entries: [...bio.entries, added] }
  if (here === undefined || last.from === season) return bio
  const closed = last.from === season - 1 ? `${last.team}-S${last.from}` : `${last.team}-S${last.from}-S${season - 1}`
  return { ...bio, entries: [...replace(closed), added] }
}

/**
 * A college player's school entries when he is named in `season`, `yearsIn` seasons after his first: each earlier season takes the school
 * whose roster had him, and a season with no roster takes the next school known.
 */
export function schoolEntries(playerId: string, teamId: string, season: number, yearsIn: number, past: RostersFile[], teams: TeamsFile): string[] {
  const roster = new Map(past.map(r => [r.season, Object.entries(r.teams).find(([, es]) => es.some(e => e.playerId === playerId))?.[0]]))
  const stints: { teamId: string; from: number; to: number }[] = []
  let school = teamId
  for (let s = season; s >= season - yearsIn; s--) {
    if (s !== season) school = roster.get(s) ?? school
    if (stints[0]?.teamId === school) stints[0].from = s
    else stints.unshift({ teamId: school, from: s, to: s })
  }
  return stints.map((x, i) => {
    const range = i === stints.length - 1 ? `S${x.from}-pres.` : x.from === x.to ? `S${x.from}` : `S${x.from}-S${x.to}`
    return `${schoolName(teams, x.teamId)}-${range}`
  })
}

/**
 * The bios with a college season on record: every named player on its rosters has a bio showing the school. Null when nothing changes.
 */
export function recordSchoolSeason(bios: PlayerBiosFile, players: PlayersFile, rosters: RostersFile, teams: TeamsFile, season: number): PlayerBiosFile | null {
  const out = [...bios.bios]
  const at = new Map(out.map((b, i) => [b.playerId, i]))
  let changed = false
  for (const [teamId, entries] of Object.entries(rosters.teams)) {
    for (const e of entries) {
      const person = e.playerId === null ? undefined : players.players[e.playerId]
      if (!person || person.name === null) continue
      const i = at.get(person.id)
      const before = i === undefined ? newBio(person.id, person.birthSeason ?? season - 18 - (YEARS_IN[e.classYear ?? 'Fr'] ?? 0)) : out[i]
      const after = withSchoolSeason(before, teamId, season, teams)
      if (i === undefined) {
        at.set(person.id, out.length)
        out.push(after)
        changed = true
      } else if (after !== before) {
        out[i] = after
        changed = true
      }
    }
  }
  return changed ? { ...bios, bios: out } : null
}
