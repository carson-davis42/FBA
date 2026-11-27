import { POSITIONS } from '../roster/rules';
import type { Position, RankingFile } from '../shared/types';
import { topOf } from './ranking';

/** The rating a position's last kept player gets, unless the top 100 go lower still. */
export const D2_FILL_FLOOR = 65;

export interface Filled { playerId: string; position: Position; positionRank: number; rating: number }

/**
 * D2 reset: the ratings of everyone kept but outside the top 100. At each position they slide evenly from the lowest top-100 rating (the
 * step above the first of them) down to 65 at the position's last place, so nobody outranks a top-100 player or anyone above him at his
 * position. Best first (ties: higher at their position, then PG, SG, SF, PF, C). Null until every top-100 player is ranked and rated.
 */
export function fillRatings(doc: RankingFile): Filled[] | null {
  if (doc.kind !== 'd2-reset' || !doc.cutMade || doc.locked) return null;
  const top = doc.order.slice(0, topOf(doc));
  if (top.length < topOf(doc) || top.some(id => doc.ratings[id] === undefined)) return null;
  const cap = Math.min(...top.map(id => doc.ratings[id]));
  const floor = Math.min(D2_FILL_FLOOR, cap);
  const inTop = new Set(top);
  const out = POSITIONS.flatMap(position => {
    const list = doc.byPosition?.[position] ?? [];
    const first = list.filter(id => inTop.has(id)).length;
    const steps = list.length - first;
    return list.slice(first).map((playerId, i) => ({
      playerId, position, positionRank: first + i + 1, rating: Math.round(cap - ((cap - floor) * (i + 1)) / steps),
    }));
  });
  // The sort is stable and `out` is in position order.
  return out.sort((a, b) => b.rating - a.rating || a.positionRank - b.positionRank);
}
