import { POSITIONS } from '../roster/rules'
import { D2_POSITION_SPOTS, type Position, type RankingFile, type RankingRow } from '../shared/types'
import { isNewRow, leftRows, type NameOf } from './ranking'

/**
 * The position step of the class ranking and the D2 reset: each position is ranked on its own (`doc.byPosition`), then the whole ranking is
 * a merge of those lists. A doc without `byPosition` ranks the old way, in one pass.
 *
 * The D2 reset ranks only each position's spots, then makes the cut (`doc.cutMade`): everyone left out goes to Reserves.
 */
export const hasPositionStep = (doc: RankingFile): boolean => doc.byPosition !== undefined

/** One position's ranking so far, best first. */
export const positionList = (doc: RankingFile, pos: Position): string[] => doc.byPosition?.[pos] ?? []

/** Rows not yet placed within their position, in `leftRows` order (last season's rating, then the new players). */
export function positionUnranked(doc: RankingFile, name: NameOf, pos: Position): RankingRow[] {
  const placed = new Set(positionList(doc, pos))
  return leftRows({ ...doc, order: [] }, name).filter(r => r.position === pos && !placed.has(r.playerId))
}

const isD2 = (doc: RankingFile): boolean => doc.kind === 'd2-reset'

/** How many places a position's ranking can hold: no limit, except the D2's spots per position. */
const limitOf = (doc: RankingFile): number => (isD2(doc) ? D2_POSITION_SPOTS : Infinity)

/** The places to fill at a position: its spots, or every player there when there are fewer. */
export function placesAt(doc: RankingFile, pos: Position, spots = limitOf(doc)): number {
  return Math.min(spots, doc.rows.filter(r => r.position === pos).length)
}

/** True when every position's places are filled. */
export function positionsFilled(doc: RankingFile, spots = limitOf(doc)): boolean {
  return hasPositionStep(doc) && POSITIONS.every(pos => positionList(doc, pos).length >= placesAt(doc, pos, spots))
}

/** True once the whole ranking can be built: every player is placed within his position, or (D2) the cut is made. */
export function positionStepDone(doc: RankingFile): boolean {
  if (isD2(doc)) return hasPositionStep(doc) && doc.cutMade === true
  return positionsFilled(doc)
}

/** Position lists change only before the whole ranking begins (class), or while the D2 cut is open. */
const editable = (doc: RankingFile): boolean => !doc.locked && (isD2(doc) ? !doc.cutMade : doc.order.length === 0)

/** Places the player next in his position's ranking. Locked docs, unknown or already placed players, and full positions leave it unchanged. */
export function takeAtPosition(doc: RankingFile, playerId: string, spots = limitOf(doc)): RankingFile {
  const row = doc.rows.find(r => r.playerId === playerId)
  if (!editable(doc) || !doc.byPosition || !row) return doc
  const list = positionList(doc, row.position)
  if (list.includes(playerId) || list.length >= spots) return doc
  return { ...doc, byPosition: { ...doc.byPosition, [row.position]: [...list, playerId] } }
}

/**
 * Takes a player out of his position's ranking. In the class ranking everyone placed below him at that position comes out too; in the D2
 * only he does, and a player already in the whole ranking stays.
 */
export function sendBackAtPosition(doc: RankingFile, playerId: string): RankingFile {
  const row = doc.rows.find(r => r.playerId === playerId)
  if (!editable(doc) || !doc.byPosition || !row || doc.order.includes(playerId)) return doc
  const list = positionList(doc, row.position)
  const at = list.indexOf(playerId)
  if (at < 0) return doc
  const next = isD2(doc) ? list.filter(id => id !== playerId) : list.slice(0, at)
  return { ...doc, byPosition: { ...doc.byPosition, [row.position]: next } }
}

/** Swaps a player with his neighbour above (-1) or below (+1) in his position's ranking. Players already in the whole ranking stay put. */
export function moveAtPosition(doc: RankingFile, playerId: string, delta: -1 | 1): RankingFile {
  const row = doc.rows.find(r => r.playerId === playerId)
  if (!editable(doc) || !doc.byPosition || !row) return doc
  const list = [...positionList(doc, row.position)]
  const at = list.indexOf(playerId)
  const to = at + delta
  if (at < 0 || to < 0 || to >= list.length || doc.order.includes(playerId) || doc.order.includes(list[to])) return doc
  ;[list[at], list[to]] = [list[to], list[at]]
  return { ...doc, byPosition: { ...doc.byPosition, [row.position]: list } }
}

/** Places the players left at a position (or all positions), in `positionUnranked` order, until it is full. */
export function takeRestAtPosition(doc: RankingFile, name: NameOf, pos?: Position, spots = limitOf(doc)): RankingFile {
  let cur = doc
  for (const p of pos ? [pos] : POSITIONS) for (const r of positionUnranked(cur, name, p)) cur = takeAtPosition(cur, r.playerId, spots)
  return cur
}

/** Starts the position step over: clears every position list. Only before the whole ranking has begun. */
export function resetPositionStep(doc: RankingFile): RankingFile {
  if (doc.locked || doc.order.length > 0) return doc
  return { ...doc, byPosition: {} }
}

/** D2: keeps the ranked players and sends everyone else to Reserves. Needs every position filled. */
export function makeCut(doc: RankingFile, spots = limitOf(doc)): RankingFile {
  if (doc.locked || !isD2(doc) || doc.cutMade || !positionsFilled(doc, spots)) return doc
  return { ...doc, cutMade: true }
}

/** D2: back to the position rankings, keeping them and the whole ranking so far. */
export function reopenCut(doc: RankingFile): RankingFile {
  if (doc.locked || !doc.cutMade) return doc
  const { cutMade: _open, ...rest } = doc
  return rest
}

/**
 * The players that can be ranked next: at each position the best one not yet in the whole ranking. Everyone else waits behind him, so a
 * position's order can't be contradicted.
 */
export function mergeHeads(doc: RankingFile): Set<string> {
  const ranked = new Set(doc.order)
  const heads = new Set<string>()
  for (const pos of POSITIONS) {
    const next = positionList(doc, pos).find(id => !ranked.has(id))
    if (next !== undefined) heads.add(next)
  }
  return heads
}

const positionAt = (pos: Position): number => POSITIONS.indexOf(pos)

/**
 * The players on offer for the next rank, in the order they are being held: the commissioner's order of the pool (`doc.pool`), then anyone
 * who just joined it (the next player at a position whose head was ranked), in PG, SG, SF, PF, C order.
 */
export function mergeOptions(doc: RankingFile): RankingRow[] {
  const heads = mergeHeads(doc)
  const byId = new Map(doc.rows.map(r => [r.playerId, r]))
  const held = (doc.pool ?? []).filter(id => heads.has(id))
  const joined = doc.rows.filter(r => heads.has(r.playerId) && !held.includes(r.playerId)).sort((a, b) => positionAt(a.position) - positionAt(b.position))
  return [...held.map(id => byId.get(id)!), ...joined]
}

/** Moves a player of the pool up (-1) or down (+1) one place. */
export function movePool(doc: RankingFile, playerId: string, delta: -1 | 1): RankingFile {
  if (doc.locked) return doc
  const ids = mergeOptions(doc).map(r => r.playerId)
  const at = ids.indexOf(playerId)
  const to = at + delta
  if (at < 0 || to < 0 || to >= ids.length) return doc
  ;[ids[at], ids[to]] = [ids[to], ids[at]]
  return { ...doc, pool: ids }
}

/** The pool's first place joins the whole ranking next; the rest stay held in order, and his position's next player joins at the bottom. */
export function promoteTop(doc: RankingFile): RankingFile {
  if (doc.locked || !positionStepDone(doc)) return doc
  const options = mergeOptions(doc)
  if (options.length === 0) return doc
  const top = options[0].playerId
  return { ...doc, order: [...doc.order, top], pool: options.slice(1).map(r => r.playerId) }
}

/**
 * Ranks everyone left by repeatedly taking the best of the position heads: players with a last-class rating before new ones, higher
 * rating first (the other league's rating for new players), and equal ratings in PG, SG, SF, PF, C order.
 */
export function takeRestMerged(doc: RankingFile, _name?: NameOf): RankingFile {
  if (doc.locked || !positionStepDone(doc)) return doc
  let cur = doc
  for (;;) {
    const options = mergeOptions(cur)
    if (options.length === 0) return cur
    const isNew = (r: RankingRow) => isNewRow(cur, r)
    const score = (r: RankingRow) => (isNew(r) ? r.otherRating : r.prevRating) ?? -1
    // Array.sort is stable and `mergeOptions` is in position order, so equal ratings stay PG, SG, SF, PF, C.
    const pick = [...options].sort((a, b) => Number(isNew(a)) - Number(isNew(b)) || score(b) - score(a))[0]
    cur = { ...cur, order: [...cur.order, pick.playerId] }
  }
}

/** Sends a ranked player back, and every player of his position ranked below him (they sit behind him in the position list). */
export function sendBackMerged(doc: RankingFile, playerId: string): RankingFile {
  const row = doc.rows.find(r => r.playerId === playerId)
  const at = doc.order.indexOf(playerId)
  if (doc.locked || !row || at < 0) return doc
  const pos = new Map(doc.rows.map(r => [r.playerId, r.position]))
  const drop = new Set(doc.order.filter((id, i) => i >= at && pos.get(id) === row.position))
  return { ...doc, order: doc.order.filter(id => !drop.has(id)) }
}
