import { describe, expect, it } from 'vitest'
import { jcStateFixture } from './testFixtures'
import { BIOS_PATH, namePlayers, type NameState } from './names'

/** An S79 college with one unnamed Jr rated 90 (needs a name) and one unnamed Fr rated 60 (doesn't). */
function setup() {
  const s = jcStateFixture()
  const team = s.teams.teams[0]
  const roster = s.rosters.teams[team.teamId]
  const jr = roster.find(e => e.playerId !== null)!
  const fr = roster.filter(e => e.playerId !== null)[1]
  jr.classYear = 'Jr'; jr.rating = 90
  fr.classYear = 'Fr'; fr.rating = 60
  s.players.players[jr.playerId!] = { ...s.players.players[jr.playerId!], name: null, birthSeason: 60 }
  s.players.players[fr.playerId!] = { ...s.players.players[fr.playerId!], name: null }
  const state: NameState = { season: s.season, players: s.players, bios: null, rosters: s.rosters, teams: s.teams }
  return { state, team, jr: jr.playerId!, fr: fr.playerId! }
}

describe('namePlayers', () => {
  it('names a player past the threshold and gives him a bio with his school and the season he started', () => {
    const { state, team, jr } = setup()
    const r = namePlayers(state, [{ playerId: jr, name: '  Marcus   Bell ' }])
    if (!r.ok) throw new Error(r.problems.join())
    expect(r.label).toBe('Name Marcus Bell')
    const [players, bios] = r.writes.map(w => w.doc) as [typeof state.players, { league: string; bios: { playerId: string; born: string; entries: string[] }[] }]
    expect(r.writes.map(w => w.path)).toEqual(['players.json', BIOS_PATH])
    expect(players.players[jr].name).toBe('Marcus Bell')
    // A Jr in S79 started in S77.
    expect(bios.bios).toEqual([{ playerId: jr, born: 'Born-S60', entries: [`${team.name}-S77-pres.`] }])
    expect(bios.league).toBe('fba')
  })

  it('keeps existing bios, does not duplicate one, and starts a Fr in the current season', () => {
    const { state, team, jr } = setup()
    const withBio = { ...state, bios: { league: 'fba' as const, bios: [{ playerId: jr, born: 'Born-S60', entries: ['Old-S70'] }, { playerId: 'p99999', born: 'Born-S50', entries: ['X-S60'] }] } }
    const r = namePlayers(withBio, [{ playerId: jr, name: 'Marcus Bell' }])
    if (!r.ok) throw new Error(r.problems.join())
    const bios = (r.writes[1].doc as { bios: { playerId: string; entries: string[] }[] }).bios
    expect(bios).toHaveLength(2);
    expect(bios.find(b => b.playerId === jr)!.entries).toEqual(['Old-S70'])
    // A Fr rated 76+ would start this season.
    const fr = setup()
    const e = fr.state.rosters.teams[fr.team.teamId].find(x => x.playerId === fr.fr)!
    e.rating = 80
    const r2 = namePlayers(fr.state, [{ playerId: fr.fr, name: 'Rookie One' }])
    if (!r2.ok) throw new Error(r2.problems.join())
    expect((r2.writes[1].doc as { bios: { entries: string[] }[] }).bios[0].entries).toEqual([`${fr.team.name}-S79-pres.`])
  })

  it('refuses a player who does not need a name, a blank or too long name, and a name that is already taken', () => {
    const { state, jr, fr } = setup()
    const problems = (e: { playerId: string; name: string }[]) => { const r = namePlayers(state, e); return r.ok ? [] : r.problems }
    expect(problems([{ playerId: fr, name: 'Nobody Needed' }])).toEqual([`${fr} doesn't need a name`])
    expect(problems([{ playerId: jr, name: '   ' }])).toEqual(["A name can't be blank"])
    expect(problems([{ playerId: jr, name: 'x'.repeat(41) }])[0]).toMatch(/too long/)
    const existing = Object.values(state.players.players).find(p => p.name)!.name!
    expect(problems([{ playerId: jr, name: existing.toUpperCase() }])).toEqual([`${existing.toUpperCase()} is already a player's name`])
    expect(problems([])).toEqual(['Type at least one name'])
  })

  it('refuses the same new name twice in one save', () => {
    const s = setup()
    const other = s.state.rosters.teams[s.team.teamId].filter(e => e.playerId !== null)[2]
    other.classYear = 'Jr'; other.rating = 85
    s.state.players.players[other.playerId!] = { ...s.state.players.players[other.playerId!], name: null }
    const r = namePlayers(s.state, [{ playerId: s.jr, name: 'Same Name' }, { playerId: other.playerId!, name: 'same name' }])
    expect(r.ok).toBe(false)
  })
})
