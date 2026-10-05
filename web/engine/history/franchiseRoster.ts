import type { Franchise, HallOfFameFile, PlayerBiosFile, PlayersFile, RosterEntry, RostersFile, SummaryFile } from '../shared/types';
import { liveCareer } from './career';

export interface FranchiseHonour { label: string; count: number; seasons: number[] }
export interface FranchisePlayer { playerId: string; name: string; seasons: number[]; honours: FranchiseHonour[]; hof: string | null }
export interface SeasonRosterRow { playerId: string; name: string; honours: string[]; slot: RosterEntry | null }
export interface FranchiseRosterInput {
  franchise: Franchise;
  players: PlayersFile;
  bios: PlayerBiosFile | null;
  summaries: SummaryFile[];
  hof: HallOfFameFile | null;
  /** The season roster files that exist (S78 on); older seasons are known only from the bios. */
  rosters: RostersFile[];
}

const season = (t: string): number | null => (/^S(\d+)$/i.exec(t) ? Number(t.slice(1)) : null);

/** The seasons a stint range covers: "S22", "S12-S18;S22", "FFL-S10" (from season 1), "S73-pres." (through S78, the last bio season). */
function stintSeasons(range: string): number[] {
  const out: number[] = [];
  for (const part of range.split(';')) {
    const toks = part.split('-').map(t => t.trim());
    const first = toks[0];
    const last = toks[toks.length - 1];
    const lo = first.toUpperCase() === 'FFL' ? 1 : season(first);
    const hi = /^pres/i.test(last) ? 78 : last.toUpperCase() === 'FFL' ? 0 : season(last);
    if (lo === null || hi === null) continue;
    for (let n = lo; n <= hi; n++) out.push(n);
  }
  return out;
}

const abbrAt = (f: Franchise, n: number): string | null => f.eras.find(e => e.from <= n && (e.to === null || n <= e.to))?.abbr ?? null;

export function franchiseSeasons(franchise: Franchise, latest: number): number[] {
  const out = new Set<number>();
  for (const e of franchise.eras) for (let n = e.from; n <= (e.to ?? latest); n++) out.add(n);
  return [...out].sort((a, b) => a - b);
}

/** [12, 13, 14, 22] -> "S12–S14, S22" */
export function seasonRanges(seasons: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < seasons.length; i++) {
    let j = i;
    while (j + 1 < seasons.length && seasons[j + 1] === seasons[j] + 1) j++;
    parts.push(j > i ? `S${seasons[i]}–S${seasons[j]}` : `S${seasons[i]}`);
    i = j;
  }
  return parts.join(', ');
}

/** Every player who played for the franchise, and each season's roster. Pre-S78 seasons come from the career bios alone. */
export function franchiseIndex(input: FranchiseRosterInput): { players: FranchisePlayer[]; rosterFor(season: number): SeasonRosterRow[] } {
  const { franchise, bios, summaries, hof, rosters } = input;
  const bioOf = new Map((bios?.bios ?? []).map(b => [b.playerId, b]));
  const slots = new Map<number, Map<string, RosterEntry>>();
  const candidates = new Set(bioOf.keys());
  for (const r of rosters) {
    const bySeason = new Map<string, RosterEntry>();
    for (const e of r.teams[franchise.teamId] ?? []) {
      if (!e.playerId) continue;
      bySeason.set(e.playerId, e);
      candidates.add(e.playerId);
    }
    slots.set(r.season, bySeason);
  }

  const rows: FranchisePlayer[] = [];
  for (const id of candidates) {
    const name = input.players.players[id]?.name;
    if (!name) continue;
    const career = liveCareer(bioOf.get(id) ?? null, id, summaries, hof);
    const seasons = new Set<number>();
    const honours = new Map<string, FranchiseHonour>();
    for (const stint of career.stints) {
      if (stint.kind !== 'fba') continue;
      const codes = stint.team.split('/');
      const covered = stintSeasons(stint.range).filter(n => {
        const abbr = abbrAt(franchise, n);
        return (abbr !== null && codes.includes(abbr)) || (n >= 79 && codes.includes(franchise.teamId));
      });
      if (covered.length === 0) continue;
      covered.forEach(n => seasons.add(n));
      for (const h of stint.honours) {
        const key = h.label.toLowerCase();
        const same = honours.get(key);
        if (same) {
          same.count += h.count;
          same.seasons = [...new Set([...same.seasons, ...h.seasons])].sort((a, b) => a - b);
        } else honours.set(key, { label: h.label, count: h.count, seasons: [...h.seasons].sort((a, b) => a - b) });
      }
    }
    for (const [n, bySeason] of slots) if (bySeason.has(id)) seasons.add(n);
    if (seasons.size === 0) continue;
    rows.push({ playerId: id, name, seasons: [...seasons].sort((a, b) => a - b), honours: [...honours.values()], hof: career.hof === null ? null : String(career.hof) });
  }
  rows.sort((a, b) => a.seasons[0] - b.seasons[0] || a.name.localeCompare(b.name));

  const rosterFor = (n: number): SeasonRosterRow[] => {
    const bySeason = slots.get(n);
    const out = rows.filter(p => p.seasons.includes(n)).map(p => ({
      playerId: p.playerId,
      name: p.name,
      honours: [...new Set(p.honours.filter(h => h.seasons.includes(n)).map(h => h.label))],
      slot: bySeason?.get(p.playerId) ?? null,
    }));
    if (bySeason) out.sort((a, b) => (b.slot?.rating ?? -1) - (a.slot?.rating ?? -1) || a.name.localeCompare(b.name));
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  };
  return { players: rows, rosterFor };
}
