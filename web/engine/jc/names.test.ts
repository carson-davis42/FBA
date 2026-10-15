import { describe, expect, it } from 'vitest'
import { jcStateFixture } from './testFixtures'
import { BIOS_PATH, completeNamed, incompleteNamed, namePlayers, type NameState } from './names'

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

describe('namePlayers birth seasons', () => {
  it('gives a named player a birth season from his class when he has none', () => {
    const { state, jr, fr } = setup()
    // A Fr is 18 in his first season, so a Jr in S79 was born in S59.
    state.players.players[jr] = { ...state.players.players[jr], birthSeason: null }
    state.rosters.teams[Object.keys(state.rosters.teams)[0]].find(e => e.playerId === fr)!.rating = 90
    const r = namePlayers(state, [{ playerId: jr, name: 'Marcus Bell' }, { playerId: fr, name: 'Finn Early' }])
    if (!r.ok) throw new Error(r.problems.join())
    const [players, bios] = r.writes.map(w => w.doc) as [typeof state.players, { bios: { playerId: string; born: string }[] }]
    expect(players.players[jr].birthSeason).toBe(59)
    expect(players.players[fr].birthSeason).toBe(61)
    expect(bios.bios.find(b => b.playerId === jr)!.born).toBe('Born-S59')
    expect(bios.bios.find(b => b.playerId === fr)!.born).toBe('Born-S61')
  })

  it('keeps a birth season the player already has', () => {
    const { state, jr } = setup()
    const r = namePlayers(state, [{ playerId: jr, name: 'Marcus Bell' }])
    if (!r.ok) throw new Error(r.problems.join())
    expect((r.writes[0].doc as typeof state.players).players[jr].birthSeason).toBe(60)
  })

  it('fixes an existing bio that has no birth season', () => {
    const { state, jr } = setup()
    state.players.players[jr] = { ...state.players.players[jr], birthSeason: null }
    const withBio = { ...state, bios: { league: 'fba' as const, bios: [{ playerId: jr, born: 'Born-S?', entries: ['Old-S70'] }] } }
    const r = namePlayers(withBio, [{ playerId: jr, name: 'Marcus Bell' }])
    if (!r.ok) throw new Error(r.problems.join())
    const bios = (r.writes[1].doc as { bios: { playerId: string; born: string; entries: string[] }[] }).bios
    expect(bios[0].born).toBe('Born-S59')
    expect(bios[0].entries).toEqual(['Old-S70'])
  })
})

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

/** `setup()` narrowed to its school's two players, so only they can be incomplete. */
function narrow() {
  const { state, team, jr, fr } = setup()
  const entries = state.rosters.teams[team.teamId].filter(e => e.playerId === jr || e.playerId === fr)
  return { state: { ...state, rosters: { ...state.rosters, teams: { [team.teamId]: entries } } }, team, jr, fr }
}

describe('completeNamed', () => {
  it('finds named players with no birth season, no bio, or an unknown birth in a bio', () => {
    const { state, jr, fr } = narrow()
    state.players.players[jr] = { ...state.players.players[jr], name: 'Marcus Bell', birthSeason: null }
    state.players.players[fr] = { ...state.players.players[fr], name: 'Finn Early', birthSeason: 61 }
    expect(incompleteNamed(state).map(n => n.playerId).sort()).toEqual([jr, fr].sort())
    const ok = { ...state, bios: { league: 'fba' as const, bios: [{ playerId: fr, born: 'Born-S61', entries: ['X-S79-pres.'] }] } }
    expect(incompleteNamed(ok).map(n => n.playerId)).toEqual([jr])
    const unknown = { ...ok, bios: { league: 'fba' as const, bios: [{ playerId: fr, born: 'Born-S?', entries: ['X-S79-pres.'] }] } }
    expect(incompleteNamed(unknown).map(n => n.playerId).sort()).toEqual([jr, fr].sort())
  })
  it('fills in the birth season, the bio and the school stint', () => {
    const { state, team, jr, fr } = narrow()
    state.players.players[jr] = { ...state.players.players[jr], name: 'Marcus Bell', birthSeason: null }
    state.players.players[fr] = { ...state.players.players[fr], name: 'Finn Early', birthSeason: 61 }
    const withFr = { ...state, bios: { league: 'fba' as const, bios: [{ playerId: fr, born: 'Born-S61', entries: ['X-S79-pres.'] }] } }
    const r = completeNamed(withFr)
    if (!r.ok) throw new Error(r.problems.join())
    const [players, bios] = r.writes.map(w => w.doc) as [typeof state.players, { bios: { playerId: string; born: string; entries: string[] }[] }]
    expect(players.players[jr].birthSeason).toBe(59)
    expect(bios.bios).toEqual([
      { playerId: fr, born: 'Born-S61', entries: ['X-S79-pres.'] },
      { playerId: jr, born: 'Born-S59', entries: [`${team.name}-S77-pres.`] },
    ])
  })
  it('says so when nothing is incomplete', () => {
    const { state, jr, fr } = narrow()
    state.players.players[jr] = { ...state.players.players[jr], name: 'Marcus Bell', birthSeason: 59 }
    state.players.players[fr] = { ...state.players.players[fr], name: 'Finn Early', birthSeason: 61 }
    const full = { ...state, bios: { league: 'fba' as const, bios: [{ playerId: jr, born: 'Born-S59', entries: ['X-S77-pres.'] }, { playerId: fr, born: 'Born-S61', entries: ['X-S79-pres.'] }] } }
    expect(completeNamed(full).ok).toBe(false)
  })
})
