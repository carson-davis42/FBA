import type { Position, RankingFile, RankingRow } from '../shared/types';

/** The display name for a player id. */
export type NameOf = (playerId: string) => string;

const MIN_RATING = 1;
const MAX_RATING = 99;

const tieBreak = (name: NameOf) => (a: RankingRow, b: RankingRow) =>
  name(a.playerId).localeCompare(name(b.playerId)) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);

/**
 * The rows not ranked yet, in last season's order: players with a previous rating (high to low), then the
 * "New" group by the other league's rating (high to low, none last). Ties break on name, then id.
 */
/** True for a player new to the league being ranked. An unrated D2 Reserve already in the pool (`inLeague`) counts as existing and sorts after the rated players. */
export function isNewRow(_doc: RankingFile, r: RankingRow): boolean {
  return r.prevRating === null && r.inLeague !== true;
}

export function leftRows(doc: RankingFile, name: NameOf): RankingRow[] {
  const ranked = new Set(doc.order);
  const left = doc.rows.filter(r => !ranked.has(r.playerId));
  const tie = tieBreak(name);
  const known = left.filter(r => !isNewRow(doc, r)).sort((a, b) => (b.prevRating ?? -1) - (a.prevRating ?? -1) || tie(a, b));
  // Equal (or missing) other ratings keep the doc's row order, which for unrated D2 rookies is the free-agent list order (the draft order).
  const at = new Map(doc.rows.map((r, i) => [r.playerId, i]));
  const fresh = left.filter(r => isNewRow(doc, r)).sort((a, b) => (b.otherRating ?? -1) - (a.otherRating ?? -1) || at.get(a.playerId)! - at.get(b.playerId)!);
  return [...known, ...fresh];
}

/** The first unranked new player at each position, in the new players' list order. Positions with none left are absent. */
export function bestNewByPosition(doc: RankingFile, name: NameOf): Partial<Record<Position, RankingRow>> {
  const best: Partial<Record<Position, RankingRow>> = {};
  for (const r of leftRows(doc, name)) if (isNewRow(doc, r) && !best[r.position]) best[r.position] = r;
  return best;
}

const NO_SKIP: ReadonlySet<string> = new Set();

/**
 * D2 reset: the ranked players past `spots` at their position. They go to the Reserve pool and get no rating, so the rating
 * checks and suggestions skip them.
 */
export function reserveBound(doc: RankingFile, spots: number): Set<string> {
  const byId = new Map(doc.rows.map(r => [r.playerId, r]));
  const taken = new Map<Position, number>();
  const out = new Set<string>();
  for (const id of doc.order) {
    const pos = byId.get(id)?.position;
    if (!pos) continue;
    const n = (taken.get(pos) ?? 0) + 1;
    taken.set(pos, n);
    if (n > spots) out.add(id);
  }
  return out;
}

/** The ranked rows, best first. */
export function rankedRows(doc: RankingFile): RankingRow[] {
  const byId = new Map(doc.rows.map(r => [r.playerId, r]));
  return doc.order.map(id => byId.get(id)!);
}

/** Ranks the player next. Unknown or already-ranked players, and locked files, leave the doc unchanged. */
export function take(doc: RankingFile, playerId: string): RankingFile {
  if (doc.locked || doc.order.includes(playerId) || !doc.rows.some(r => r.playerId === playerId)) return doc;
  return { ...doc, order: [...doc.order, playerId] };
}

/** Returns a ranked player to the left column. Their entered rating stays in `ratings`. */
export function sendBack(doc: RankingFile, playerId: string): RankingFile {
  if (doc.locked || !doc.order.includes(playerId)) return doc;
  return { ...doc, order: doc.order.filter(id => id !== playerId) };
}

/** Ranks everyone left, in `leftRows` order. With `only`, ranks just the left rows it accepts (order kept). */
export function takeRest(doc: RankingFile, name: NameOf, only?: (row: RankingRow) => boolean): RankingFile {
  if (doc.locked) return doc;
  const rest = leftRows(doc, name).filter(r => !only || only(r));
  return rest.length ? { ...doc, order: [...doc.order, ...rest.map(r => r.playerId)] } : doc;
}

/** The suggested rating for rank k (1-based): the rating that held rank k last season. */
export function suggestion(doc: RankingFile, k: number): number | null {
  return doc.curve[k - 1] ?? null;
}

/** Sets a rating (a whole number from 1 to 99) or clears it (null). Anything else leaves the doc unchanged. */
export function setRating(doc: RankingFile, playerId: string, value: number | null): RankingFile {
  if (doc.locked || !doc.rows.some(r => r.playerId === playerId)) return doc;
  if (value === null) {
    if (doc.ratings[playerId] === undefined) return doc;
    const { [playerId]: _cleared, ...rest } = doc.ratings;
    return { ...doc, ratings: rest };
  }
  if (!Number.isInteger(value) || value < MIN_RATING || value > MAX_RATING || doc.ratings[playerId] === value) return doc;
  return { ...doc, ratings: { ...doc.ratings, [playerId]: value } };
}

/** Gives every ranked player without a rating their rank's suggestion. Never overwrites a typed rating. */
export function applyAllSuggestions(doc: RankingFile, skip: ReadonlySet<string> = NO_SKIP): RankingFile {
  if (doc.locked) return doc;
  const ratings = { ...doc.ratings };
  let changed = false;
  doc.order.forEach((id, i) => {
    const s = suggestion(doc, i + 1);
    if (ratings[id] === undefined && s !== null && !skip.has(id)) {
      ratings[id] = s;
      changed = true;
    }
  });
  return changed ? { ...doc, ratings } : doc;
}

export interface RankedRating { id: string; rank: number; rating: number }

/** Each rated player whose rating is higher than the lowest rating ranked above them, paired with that player. */
export function outOfOrderPairs(doc: RankingFile, skip: ReadonlySet<string> = NO_SKIP): { above: RankedRating; below: RankedRating }[] {
  const out: { above: RankedRating; below: RankedRating }[] = [];
  let lowest: RankedRating | null = null;
  doc.order.forEach((id, i) => {
    const rating = doc.ratings[id];
    if (rating === undefined || skip.has(id)) return;
    const cur = { id, rank: i + 1, rating };
    if (lowest && rating > lowest.rating) out.push({ above: lowest, below: cur });
    else lowest = cur;
  });
  return out;
}

/** The ids to flag on screen: players rated above someone ranked higher. */
export function outOfOrder(doc: RankingFile, skip: ReadonlySet<string> = NO_SKIP): Set<string> {
  return new Set(outOfOrderPairs(doc, skip).map(p => p.below.id));
}

/** Why the ranking can't be finished yet; empty when it can. */
export function rankingBlockers(doc: RankingFile, name: NameOf, skip: ReadonlySet<string> = NO_SKIP): string[] {
  const out: string[] = [];
  const left = doc.rows.length - doc.order.length;
  if (left) out.push(left === 1 ? "1 player isn't ranked yet" : `${left} players aren't ranked yet`);
  const unrated = doc.order.filter(id => doc.ratings[id] === undefined && !skip.has(id)).length;
  if (unrated) out.push(unrated === 1 ? '1 player still needs a rating' : `${unrated} players still need a rating`);
  for (const { above, below } of outOfOrderPairs(doc, skip)) {
    out.push(`#${below.rank} ${name(below.id)} (${below.rating}) is rated above #${above.rank} ${name(above.id)} (${above.rating})`);
  }
  return out;
}

/** How many ranked players have exactly their rank's suggestion. */
export function suggestionsTaken(doc: RankingFile, skip: ReadonlySet<string> = NO_SKIP): number {
  return doc.order.filter((id, i) => !skip.has(id) && doc.ratings[id] !== undefined && doc.ratings[id] === suggestion(doc, i + 1)).length;
}

/** Brings the rows in line with who should be listed: new players are added (unranked), missing ones are removed from rows, order and ratings. A locked doc is returned unchanged. */
export function syncRows(doc: RankingFile, rows: RankingRow[]): RankingFile {
  if (doc.locked) return doc;

  // Build a map of new rows by playerId
  const newRowMap = new Map(rows.map(r => [r.playerId, r]));

  // Check if membership has changed
  const oldPlayerIds = new Set(doc.rows.map(r => r.playerId));
  const newPlayerIds = new Set(newRowMap.keys());

  if (oldPlayerIds.size === newPlayerIds.size && [...oldPlayerIds].every(id => newPlayerIds.has(id))) {
    // Membership hasn't changed, return the same object
    return doc;
  }

  // Build new rows array, preserving old row objects where possible
  const newRows = rows.map(r => {
    const oldRow = doc.rows.find(old => old.playerId === r.playerId);
    return oldRow || r;
  });

  // Filter order and ratings to only include players in the new rows
  const order = doc.order.filter(id => newPlayerIds.has(id));
  const ratings: Record<string, number> = {};
  for (const id of Object.keys(doc.ratings)) {
    if (newPlayerIds.has(id)) {
      ratings[id] = doc.ratings[id];
    }
  }

  return { ...doc, rows: newRows, order, ratings };
}
