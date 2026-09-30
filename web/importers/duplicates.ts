import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { Player, PlayersFile } from '../engine/shared/types';
import { normName } from './history';
import type { Report } from './report';
import type { BioRow } from './sheets/history';
import { parsePlayersTab } from './sheets/playersTab';

const PLAYERS = 'players.json';

interface Plan { name: string; kept: string; dropped: string[]; merged: Player }

/** The record to keep: the bio's born season, else a known birth season, else the lowest id. */
function pickKept(group: Player[], born: number | null): Player {
  const byId = [...group].sort((a, b) => a.id.localeCompare(b.id));
  return (born !== null ? byId.find(p => p.birthSeason === born) : undefined)
    ?? byId.find(p => p.birthSeason !== null)
    ?? byId[0];
}

/** The kept record under the Players-tab spelling, with its null fields filled from the dropped records. */
function mergeRecords(kept: Player, dropped: Player[], name: string, born: number | null): Player {
  const merged: Record<string, unknown> = { ...kept };
  for (const d of dropped) {
    for (const [k, v] of Object.entries(d)) {
      if ((merged[k] === null || merged[k] === undefined) && v !== null && v !== undefined) merged[k] = v;
    }
  }
  merged.name = name;
  merged.birthSeason = born ?? kept.birthSeason;
  return merged as unknown as Player;
}

interface Walk { value: unknown; count: Map<string, number>; collision: string | null }

/** Replaces every string value and object key that equals a dropped id. */
function rewrite(value: unknown, map: Map<string, string>, walk: { count: Map<string, number>; collision: string | null }): unknown {
  const hit = (s: string): string => {
    const to = map.get(s);
    if (to === undefined) return s;
    walk.count.set(s, (walk.count.get(s) ?? 0) + 1);
    return to;
  };
  if (typeof value === 'string') return hit(value);
  if (Array.isArray(value)) return value.map(v => rewrite(v, map, walk));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nk = hit(k);
      if (nk in out && walk.collision === null) walk.collision = `the key ${nk} would appear twice`;
      out[nk] = rewrite(v, map, walk);
    }
    return out;
  }
  return value;
}

function rewriteDoc(doc: unknown, map: Map<string, string>): Walk {
  const walk = { count: new Map<string, number>(), collision: null as string | null };
  return { value: rewrite(doc, map, walk), ...walk };
}

/** A season roster must not list one player twice (the roster schema has no such rule). */
function rosterDuplicate(doc: unknown, keptIds: Set<string>): string | null {
  const teams = (doc as { teams?: Record<string, { playerId?: string | null }[]> }).teams ?? {};
  const seen = new Set<string>();
  for (const entries of Object.values(teams)) {
    for (const e of entries) {
      const id = e.playerId;
      if (!id || !keptIds.has(id)) continue;
      if (seen.has(id)) return `${id} is on the rosters twice`;
      seen.add(id);
    }
  }
  return null;
}

/**
 * K9: when exactly one Players-tab row matches two or more player records, they are one player. Merges them into the
 * kept record, rewrites every reference, and returns only the changed docs (players.json included). Returns an empty
 * map, with an error reported, if any rewritten doc would fail its schema.
 */
export function mergeDuplicates(docs: Map<string, unknown>, bios: BioRow[], report: Report): Map<string, unknown> {
  const changed = new Map<string, unknown>();
  const playersDoc = docs.get(PLAYERS) as PlayersFile | undefined;
  if (!playersDoc) return changed;

  const rowsByName = new Map<string, BioRow[]>();
  for (const b of bios) rowsByName.set(normName(b.name), [...(rowsByName.get(normName(b.name)) ?? []), b]);
  const byName = new Map<string, Player[]>();
  for (const p of Object.values(playersDoc.players)) {
    if (p.name === null) continue;
    byName.set(normName(p.name), [...(byName.get(normName(p.name)) ?? []), p]);
  }

  const plans: Plan[] = [];
  for (const [key, group] of byName) {
    if (group.length < 2 || rowsByName.get(key)?.length !== 1) continue;
    const bio = rowsByName.get(key)![0];
    const born = parsePlayersTab([[bio.name, bio.born]])[0].born;
    const kept = pickKept(group, born);
    const dropped = group.filter(p => p.id !== kept.id);
    plans.push({ name: bio.name, kept: kept.id, dropped: dropped.map(p => p.id).sort(), merged: mergeRecords(kept, dropped, bio.name, born) });
  }
  if (plans.length === 0) return changed;

  const map = new Map<string, string>();
  for (const p of plans) for (const d of p.dropped) map.set(d, p.kept);
  const keptIds = new Set(plans.map(p => p.kept));

  const counts = new Map<string, number>();
  const files = new Map<string, number>();
  const problems: string[] = [];

  const players = { ...playersDoc.players };
  for (const p of plans) {
    for (const d of p.dropped) delete players[d];
    players[p.kept] = p.merged;
  }
  const newPlayers: PlayersFile = { ...playersDoc, players };
  changed.set(PLAYERS, newPlayers);

  for (const [rel, doc] of docs) {
    if (rel === PLAYERS) continue;
    const w = rewriteDoc(doc, map);
    if (w.count.size === 0) continue;
    for (const [id, n] of w.count) {
      counts.set(id, (counts.get(id) ?? 0) + n);
      files.set(id, (files.get(id) ?? 0) + 1);
    }
    if (w.collision) problems.push(`${rel}: ${w.collision}`);
    else if (/(^|\/)rosters\.json$/.test(rel)) {
      const dup = rosterDuplicate(w.value, keptIds);
      if (dup) problems.push(`${rel}: ${dup}`);
    }
    changed.set(rel, w.value);
  }

  for (const [rel, doc] of changed) {
    const schema = schemaForPath(rel);
    if (!schema) continue;
    const r = schema.safeParse(doc);
    if (!r.success) {
      const i = r.error.issues[0];
      problems.push(`${rel}: ${i.path.length ? `${i.path.join('.')} ` : ''}${i.message}`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) report.error('duplicates', p);
    return new Map();
  }
  for (const p of plans) {
    for (const d of p.dropped) {
      report.info('duplicates', `Merged ${p.name}: ${d} → ${p.kept} (${counts.get(d) ?? 0} references in ${files.get(d) ?? 0} files)`);
    }
  }
  return changed;
}
