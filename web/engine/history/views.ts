import { normalizeName } from '../shared/names';
import type { PlayerBiosFile, PlayersFile, SummaryFile } from '../shared/types';
import { formatScore } from './format';

export interface ChampionshipRow { season: number; champion: string; runnerUp: string | null; score: string; finalsMvp: string | null; west: string | null; east: string | null }

const FBA_TITLE = 'FBA Champion';

function conferenceChampion(s: SummaryFile, id: 'W-CF' | 'E-CF', key: 'W' | 'E'): string | null {
  if (s.confChampions) {
    const named = s.confChampions[key];
    if (named) return named;
  }
  const winner = s.bracket?.series.find(x => x.id === id)?.winner;
  if (!winner) return null;
  return s.standings?.find(r => r.teamId === winner)?.name ?? winner;
}

/** The FBA champions, newest season first. */
export function championshipRows(seasons: SummaryFile[]): ChampionshipRow[] {
  const rows: ChampionshipRow[] = [];
  for (const s of seasons) {
    const c = s.champions.find(x => x.title === FBA_TITLE);
    if (!c) continue;
    rows.push({
      season: s.season,
      champion: c.champion,
      runnerUp: c.runnerUp,
      score: formatScore(c.score),
      finalsMvp: c.finalsMvp ?? null,
      west: conferenceChampion(s, 'W-CF', 'W'),
      east: conferenceChampion(s, 'E-CF', 'E'),
    });
  }
  return rows.sort((a, b) => b.season - a.season);
}

export type FbaAwardKey = 'MVP' | 'ROTY' | 'PPK' | 'LP' | 'MC' | 'DPOY' | 'MIP';
const FBA_AWARD_KEYS: readonly string[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];
export interface AwardRow { season: number; winners: Partial<Record<FbaAwardKey, { playerId: string; teamId: string }>> }

/** The FBA award winners of each season that has any, newest first. */
export function awardRows(seasons: SummaryFile[]): AwardRow[] {
  const rows: AwardRow[] = [];
  for (const s of seasons) {
    const winners: AwardRow['winners'] = {};
    for (const a of s.awards ?? []) {
      if (FBA_AWARD_KEYS.includes(a.award)) winners[a.award as FbaAwardKey] = { playerId: a.playerId, teamId: a.teamId };
    }
    if (Object.keys(winners).length > 0) rows.push({ season: s.season, winners });
  }
  return rows.sort((a, b) => b.season - a.season);
}

export interface IndexedPlayer { playerId: string; name: string }

/** Every player named in the history, with a name in players.json, sorted by name. */
export function playerIndex(seasons: SummaryFile[], bios: PlayerBiosFile | null, players: PlayersFile): IndexedPlayer[] {
  const ids = new Set<string>((bios?.bios ?? []).map(b => b.playerId));
  const add = (id: string | null | undefined) => { if (id) ids.add(id); };
  for (const s of seasons) {
    for (const a of s.awards ?? []) add(a.playerId);
    for (const team of [s.allFba?.team1, s.allFba?.team2]) for (const slot of team ?? []) add(slot.playerId);
    const st = s.allStar;
    if (st) {
      for (const id of [st.asgMvp, st.fivePoint, st.dunk, st.ysgMvp]) add(id);
      for (const id of [...st.allStars, ...st.youngStars]) add(id);
    }
    for (const c of s.champions) add(c.finalsMvp);
    for (const p of s.players ?? []) add(p.playerId);
  }
  const out: IndexedPlayer[] = [];
  for (const playerId of ids) {
    const name = players.players[playerId]?.name;
    if (name) out.push({ playerId, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
}

/** A normalised substring match on the name; an empty query returns everyone. */
export function searchPlayers(index: IndexedPlayer[], q: string): IndexedPlayer[] {
  const needle = normalizeName(q);
  if (needle === '') return index;
  return index.filter(p => normalizeName(p.name).includes(needle));
}
