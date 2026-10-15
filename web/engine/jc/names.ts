import type { PlayerBio, PlayerBiosFile, PlayersFile, RostersFile, TeamsFile } from '../shared/types'
import type { JcState } from './state'
import { namesNeeded } from './start'

export const BIOS_PATH = 'leagues/fba/playerBios.json'
const MAX_NAME = 40
/** Seasons a college player has already spent at his school, by class year (a Fr is in his first). */
const YEARS_IN: Record<string, number> = { Fr: 0, So: 1, Jr: 2, Sr: 3 }

export interface NameState { season: number; players: PlayersFile; bios: PlayerBiosFile | null; rosters: RostersFile; teams: TeamsFile; awards?: JcState['awards'] }
export type NameResult = { ok: true; writes: { path: string; doc: unknown }[]; label: string } | { ok: false; problems: string[] }

const squash = (s: string): string => s.trim().replace(/\s+/g, ' ')

/**
 * Names the unnamed players who are past the naming thresholds. Each becomes an official player: his name goes into the players file
 * and a bio is added ("School-S79-pres.", the season he started there worked out from his class), so he is listed in player history
 * with a career. Names must be new: one a player already has would make name lookups ambiguous.
 */
export function namePlayers(state: NameState, entries: { playerId: string; name: string }[]): NameResult {
  const needed = new Map(namesNeeded({ rosters: state.rosters, players: state.players, awards: state.awards }).map(n => [n.playerId, n]));
  const problems: string[] = [];
  if (entries.length === 0) return { ok: false, problems: ['Type at least one name'] };
  const taken = new Set(Object.values(state.players.players).filter(p => p.name !== null).map(p => squash(p.name!).toLowerCase()));
  const fresh = new Set<string>();
  const clean: { playerId: string; name: string }[] = [];
  for (const e of entries) {
    const name = squash(e.name);
    const need = needed.get(e.playerId);
    if (!need) { problems.push(`${e.playerId} doesn't need a name`); continue; }
    if (name === '') { problems.push('A name can\'t be blank'); continue; }
    if (name.length > MAX_NAME) { problems.push(`"${name.slice(0, 20)}…" is too long (${MAX_NAME} letters at most)`); continue; }
    const key = name.toLowerCase();
    if (taken.has(key) || fresh.has(key)) { problems.push(`${name} is already a player's name`); continue; }
    fresh.add(key);
    clean.push({ playerId: e.playerId, name });
  }
  if (problems.length) return { ok: false, problems };

  const school = (teamId: string): string => state.teams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
  const players: PlayersFile = { ...state.players, players: { ...state.players.players } };
  const bios = [...(state.bios?.bios ?? [])];
  for (const { playerId, name } of clean) {
    const need = needed.get(playerId)!;
    const person = state.players.players[playerId];
    // A freshman is 18 in his first season; a player with no birth season gets one from his class year.
    const yearsIn = YEARS_IN[need.classYear] ?? 0;
    const birthSeason = person.birthSeason ?? state.season - 18 - yearsIn;
    players.players[playerId] = { ...person, name, birthSeason };
    const at = bios.findIndex(b => b.playerId === playerId);
    if (at >= 0 && bios[at].born === 'Born-S?') bios[at] = { ...bios[at], born: `Born-S${birthSeason}` };
    if (at < 0) {
      const started = state.season - yearsIn;
      const bio: PlayerBio = {
        playerId,
        born: `Born-S${birthSeason}`,
        entries: [`${school(need.teamId)}-S${started}-pres.`],
      };
      bios.push(bio);
    }
  }
  const label = clean.length === 1 ? `Name ${clean[0].name}` : `Name ${clean.length} players`;
  return { ok: true, label, writes: [{ path: 'players.json', doc: players }, { path: BIOS_PATH, doc: { league: 'fba', bios } satisfies PlayerBiosFile }] };
}

/** Named players on a college roster whose record is incomplete: no birth season, no bio, or a bio that does not know when he was born. */
export function incompleteNamed(state: NameState): { playerId: string; teamId: string; classYear: string }[] {
  const bioOf = new Map((state.bios?.bios ?? []).map(b => [b.playerId, b]));
  const out: { playerId: string; teamId: string; classYear: string }[] = [];
  const seen = new Set<string>();
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    for (const e of entries) {
      if (e.playerId === null || seen.has(e.playerId)) continue;
      const person = state.players.players[e.playerId];
      if (!person || person.name === null) continue;
      const bio = bioOf.get(e.playerId);
      if (person.birthSeason !== null && person.birthSeason !== undefined && bio && bio.born !== 'Born-S?') continue;
      seen.add(e.playerId);
      out.push({ playerId: e.playerId, teamId, classYear: e.classYear ?? 'Fr' });
    }
  }
  return out;
}

/** Gives every incomplete named college player a birth season (18 in his first season) and a bio with his school, as naming does. */
export function completeNamed(state: NameState): NameResult {
  const todo = incompleteNamed(state);
  if (todo.length === 0) return { ok: false, problems: ['Every named player already has a birth season and a bio'] };
  const school = (teamId: string): string => state.teams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
  const players: PlayersFile = { ...state.players, players: { ...state.players.players } };
  const bios = [...(state.bios?.bios ?? [])];
  for (const { playerId, teamId, classYear } of todo) {
    const person = state.players.players[playerId];
    const yearsIn = YEARS_IN[classYear] ?? 0;
    const birthSeason = person.birthSeason ?? state.season - 18 - yearsIn;
    players.players[playerId] = { ...person, birthSeason };
    const at = bios.findIndex(b => b.playerId === playerId);
    if (at >= 0) bios[at] = { ...bios[at], born: `Born-S${birthSeason}` };
    else bios.push({ playerId, born: `Born-S${birthSeason}`, entries: [`${school(teamId)}-S${state.season - yearsIn}-pres.`] });
  }
  const label = todo.length === 1 ? 'Complete a named player' : `Complete ${todo.length} named players`;
  return { ok: true, label, writes: [{ path: 'players.json', doc: players }, { path: BIOS_PATH, doc: { league: 'fba', bios } satisfies PlayerBiosFile }] };
}
