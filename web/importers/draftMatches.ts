import type { DraftHistoryFile, PlayersFile } from '../engine/shared/types';

/** Draft picks the sheet spells differently from `players.json` (so the importer left them unmatched), checked by hand. */
export const DRAFT_MATCHES: { season: number; pick: number; name: string; playerId: string }[] = [
  { season: 71, pick: 4, name: 'Izayah Hillirad', playerId: 'p00119' }, // Izayah Hilliard
  { season: 73, pick: 24, name: 'Keith Cambell', playerId: 'p00371' }, // Keith Campbell
  { season: 78, pick: 7, name: 'Duke Chudvonsky', playerId: 'p00087' }, // Duke Chudnovsky
];

/**
 * The same person under two ids, found because the draft sheet and the Players tab spell the name differently. `keep` is the id the rosters and
 * results already use; `name` is the Players-tab spelling it takes.
 */
export const PLAYER_MERGES: { keep: string; drop: string; name: string }[] = [
  { keep: 'p00065', drop: 'p02358', name: "D'Andre Holliday" }, // Michigan State S74, drafted by Texas #8 in S75, Mountain West from S76
  { keep: 'p00256', drop: 'p00461', name: 'Adrien Moreau' }, // Illinois S69-S71, undrafted in S72, D2 Florence
];

/** `doc` with every value and every object key equal to `drop` replaced by `keep`; throws when an object has both as keys. Returns the changes counted. */
export function replacePlayerId(doc: unknown, drop: string, keep: string): { doc: unknown; changed: number } {
  let changed = 0;
  const walk = (v: unknown): unknown => {
    if (v === drop) {
      changed++;
      return keep;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (drop in o && keep in o) throw new Error(`An object has both ${keep} and ${drop} as keys`);
      return Object.fromEntries(Object.entries(o).map(([k, x]) => {
        if (k === drop) changed++;
        return [k === drop ? keep : k, walk(x)];
      }));
    }
    return v;
  };
  const out = walk(doc);
  return changed ? { doc: out, changed } : { doc, changed: 0 };
}

/** The `keep` record under `name`, its empty fields filled from the `drop` record, which is removed. Unchanged when `drop` is already gone. */
export function mergePlayerRecords(players: PlayersFile, keep: string, drop: string, name: string): PlayersFile {
  const k = players.players[keep];
  const d = players.players[drop];
  if (!k || !d) return players;
  const merged: Record<string, unknown> = { ...k };
  for (const [key, v] of Object.entries(d)) if ((merged[key] === null || merged[key] === undefined) && v !== null && v !== undefined) merged[key] = v;
  merged.name = name;
  const { [drop]: _gone, ...rest } = players.players;
  return { ...players, players: { ...rest, [keep]: merged as unknown as PlayersFile['players'][string] } };
}

/** Sets the player id on each pick found by season, pick number and sheet name; picks that already have it, or don't match, are skipped. */
export function matchDraftPicks(draft: DraftHistoryFile, matches: typeof DRAFT_MATCHES): { draft: DraftHistoryFile; changed: string[] } {
  const changed: string[] = [];
  const drafts = draft.drafts.map(d => ({
    ...d,
    picks: d.picks.map(p => {
      const m = matches.find(x => x.season === d.season && x.pick === p.pick && x.name === p.name);
      if (!m || p.playerId === m.playerId) return p;
      changed.push(`S${d.season} #${p.pick} ${p.name} -> ${m.playerId}`);
      return { ...p, playerId: m.playerId };
    }),
  }));
  return changed.length ? { draft: { ...draft, drafts }, changed } : { draft, changed };
}
