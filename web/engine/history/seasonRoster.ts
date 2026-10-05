import type { PlayerBiosFile, PlayersFile } from '../shared/types';
import { parseBio } from './career';
import { stintSeasons } from './franchiseRoster';

export interface BiosRosterRow { playerId: string; name: string; honours: string[] }

/** "Wake Forest", "wake-forest" and "WAKE FOREST." are the same team. */
const key = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

/** The name inside "D2(San Jose)" or "WC(UK)"; a college stint is already its school's name. */
const placeOf = (team: string): string => /^[A-Z0-9]+\((.+)\)$/.exec(team)?.[1] ?? team;

/**
 * The players the career bios place on a D2 club ('d2'), a national team ('wc') or a college ('college') in a season, with the honours dated that season.
 * Only players with a bio can appear, so these rosters can be partial.
 */
export function rosterFromBios(
  kind: 'd2' | 'wc' | 'college', teamName: string, season: number, input: { players: PlayersFile; bios: PlayerBiosFile | null },
): BiosRosterRow[] {
  const want = key(teamName);
  const rows: BiosRosterRow[] = [];
  for (const bio of input.bios?.bios ?? []) {
    const name = input.players.players[bio.playerId]?.name;
    if (!name) continue;
    const career = parseBio(bio);
    const stints = (kind === 'wc' ? career.nationalTeams : career.stints).filter(s => s.kind === kind);
    const here = stints.filter(s => key(placeOf(s.team)) === want && stintSeasons(s.range).includes(season));
    if (here.length === 0) continue;
    const honours = new Set<string>();
    for (const s of here) for (const h of s.honours) if (h.seasons.includes(season)) honours.add(h.label);
    rows.push({ playerId: bio.playerId, name, honours: [...honours] });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
