import { POSITIONS } from '../roster/rules'
import type { Position, RankingFile, RankingRow } from '../shared/types'
import { leftRows, type NameOf } from './ranking'

/**
 * The class ranking's position step: each position is ranked on its own (`doc.byPosition`), then the whole ranking is a merge of those
 * lists. A doc without `byPosition` ranks the old way, in one pass.
 */
export const hasPositionStep = (doc: RankingFile): boolean => doc.byPosition !== undefined

/** One position's ranking so far, best first. */
export const positionList = (doc: RankingFile, pos: Position): string[] => doc.byPosition?.[pos] ?? []

/** Rows not yet placed within their position, in `leftRows` order (last season's rating, then the new players). */
export function positionUnranked(doc: RankingFile, name: NameOf, pos: Position): RankingRow[] {
  const placed = new Set(positionList(doc, pos))
  return leftRows({ ...doc, order: [] }, name).filter(r => r.position === pos && !placed.has(r.playerId))
}

/** True once every player is placed within his position. */
export function positionStepDone(doc: RankingFile): boolean {
  return hasPositionStep(doc) && doc.rows.every(r => positionList(doc, r.position).includes(r.playerId))
}

/** Places the player next in his position's ranking. Locked docs, unknown or already placed players leave it unchanged. */
export function takeAtPosition(doc: RankingFile, playerId: string): RankingFile {
  const row = doc.rows.find(r => r.playerId === playerId)
  if (doc.locked || !doc.byPosition || !row || doc.order.length > 0 || positionList(doc, row.position).includes(playerId)) return doc
  return { ...doc, byPosition: { ...doc.byPosition, [row.position]: [...positionList(doc, row.position), playerId] } }
}

/** Takes a player out of his position's ranking, and every player placed below him at that position (so the list stays gap-free). */
export function sendBackAtPosition(doc: RankingFile, playerId: string): RankingFile {
  const row = doc.rows.find(r => r.playerId === playerId)
  if (doc.locked || !doc.byPosition || !row || doc.order.length > 0) return doc
  const list = positionList(doc, row.position)
  const at = list.indexOf(playerId)
  if (at < 0) return doc
  return { ...doc, byPosition: { ...doc.byPosition, [row.position]: list.slice(0, at) } }
}

/** Places every player left at a position (or all positions), in `positionUnranked` order. */
export function takeRestAtPosition(doc: RankingFile, name: NameOf, pos?: Position): RankingFile {
  let cur = doc
  for (const p of pos ? [pos] : POSITIONS) for (const r of positionUnranked(cur, name, p)) cur = takeAtPosition(cur, r.playerId)
  return cur
}

/** Starts the position step over: clears every position list. Only before the whole ranking has begun. */
export function resetPositionStep(doc: RankingFile): RankingFile {
  if (doc.locked || doc.order.length > 0) return doc
  return { ...doc, byPosition: {} }
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

/** Ranks everyone left by repeatedly taking, of the position heads, the one that comes first in `leftRows` order. */
export function takeRestMerged(doc: RankingFile, name: NameOf): RankingFile {
  if (doc.locked || !positionStepDone(doc)) return doc
  let cur = doc
  for (;;) {
    const heads = mergeHeads(cur)
    if (heads.size === 0) return cur
    const pick = leftRows(cur, name).find(r => heads.has(r.playerId))
    if (!pick) return cur
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
