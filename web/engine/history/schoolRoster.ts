import type { HallOfFameFile, PlayerBiosFile, PlayersFile, ResultsFile, RosterEntry, RostersFile } from '../shared/types';
import { liveCareer } from './career';
import { stintSeasons, type FranchiseHonour, type FranchisePlayer, type SeasonRosterRow } from './franchiseRoster';
import { key, placeOf } from './seasonRoster';

export interface SchoolRosterInput {
  team: { teamId: string; name: string };
  players: PlayersFile;
  bios: PlayerBiosFile | null;
  hof: HallOfFameFile | null;
  /** The FBAJC season roster files that exist (S78 on); older seasons are known only from the bios. */
  rosters: RostersFile[];
  /** The open season's games: who played for the school before any roster file or bio says so. */
  results?: ResultsFile | null;
}

/**
 * Every player who played for a school and each season's roster, in the shapes of `franchiseIndex`. A bio places a player at
 * a school by the school's exact name; roster files and box scores add the seasons from S78 on.
 */
export function schoolIndex(input: SchoolRosterInput): { players: FranchisePlayer[]; rosterFor(season: number): SeasonRosterRow[]; seasons: number[] } {
  const { team, hof, rosters } = input;
  const want = key(team.name);
  const bioOf = new Map((input.bios?.bios ?? []).map(b => [b.playerId, b]));
  const slots = new Map<number, Map<string, RosterEntry>>();
  const playedIn = new Map<string, Set<number>>();
  const candidates = new Set(bioOf.keys());
  const addSeason = (id: string, n: number): void => {
    candidates.add(id);
    playedIn.set(id, (playedIn.get(id) ?? new Set()).add(n));
  };
  for (const r of rosters) {
    const bySeason = new Map<string, RosterEntry>();
    for (const e of r.teams[team.teamId] ?? []) {
      if (!e.playerId) continue;
      bySeason.set(e.playerId, e);
      addSeason(e.playerId, r.season);
    }
    slots.set(r.season, bySeason);
  }
  const results = input.results && !slots.has(input.results.season) ? input.results : null;
  for (const g of results?.games ?? []) {
    const side = g.home === team.teamId ? 'home' : g.away === team.teamId ? 'away' : null;
    if (side) for (const l of g.box?.[side] ?? []) addSeason(l.playerId, results!.season);
  }

  const rows: FranchisePlayer[] = [];
  for (const id of candidates) {
    const name = input.players.players[id]?.name;
    if (!name) continue;
    const career = liveCareer(bioOf.get(id) ?? null, id, [], hof);
    const seasons = new Set<number>(playedIn.get(id) ?? []);
    const honours = new Map<string, FranchiseHonour>();
    for (const stint of career.stints) {
      if (stint.kind !== 'college' || key(placeOf(stint.team)) !== want) continue;
      stintSeasons(stint.range).forEach(n => seasons.add(n));
      for (const h of stint.honours) {
        const same = honours.get(h.label.toLowerCase());
        if (same) {
          same.count += h.count;
          same.seasons = [...new Set([...same.seasons, ...h.seasons])].sort((a, b) => a - b);
        } else honours.set(h.label.toLowerCase(), { label: h.label, count: h.count, seasons: [...h.seasons].sort((a, b) => a - b) });
      }
    }
    if (seasons.size === 0) continue;
    rows.push({ playerId: id, name, seasons: [...seasons].sort((a, b) => a - b), honours: [...honours.values()], hof: career.hof === null ? null : String(career.hof) });
  }
  rows.sort((a, b) => a.seasons[0] - b.seasons[0] || a.name.localeCompare(b.name));

  const rosterFor = (n: number): SeasonRosterRow[] => {
    const bySeason = slots.get(n);
    const out = rows.filter(p => p.seasons.includes(n)).map(p => ({
      playerId: p.playerId,
      name: p.name,
      honours: p.honours.filter(h => h.seasons.includes(n)).map(h => h.label),
      slot: bySeason?.get(p.playerId) ?? null,
    }));
    if (bySeason) out.sort((a, b) => (b.slot?.rating ?? -1) - (a.slot?.rating ?? -1) || a.name.localeCompare(b.name));
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  };
  const seasons = [...new Set(rows.flatMap(r => r.seasons))].sort((a, b) => a - b);
  return { players: rows, rosterFor, seasons };
}
