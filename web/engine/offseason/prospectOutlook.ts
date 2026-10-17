import { boosted } from '../rank/classBoost';
import { POSITIONS } from '../roster/rules';
import type { DraftProspect, Position, RostersFile } from '../shared/types';

export interface OutlookSettings {
  /** An FBA player rated at or below this can be replaced by a rookie. */
  replaceableAtOrBelow: number;
  /** The overall rank up to which prospects usually make a roster (history). */
  historyCutoff: number;
  /** Spots, across the league, that D2 players and other non-draftees take. */
  d2Reserve: number;
}

export const DEFAULT_OUTLOOK: OutlookSettings = { replaceableAtOrBelow: 67, historyCutoff: 12, d2Reserve: 5 };

export type Signal = 'stay' | 'close' | 'withdraw';

export interface ProspectOutlook {
  overallRank: number;
  positionRank: number;
  /** Spots at his position for rookies. */
  spots: number;
  positionCheck: boolean;
  historyCheck: boolean;
  /** Null for a senior, who graduates whatever he does. */
  signal: Signal | null;
}

/**
 * The spots a rookie can take at each position: the open slots plus the FBA players rated at or below the cutoff, less the D2 reserve, which is
 * shared across the positions in proportion to those counts (largest remainder, ties to the earlier position).
 */
export function positionSpots(fba: RostersFile, settings: OutlookSettings): Record<Position, number> {
  const raw = Object.fromEntries(POSITIONS.map(p => [p, 0])) as Record<Position, number>;
  for (const entries of Object.values(fba.teams)) {
    for (const e of entries) {
      if (e.playerId === null || (e.rating !== null && e.rating <= settings.replaceableAtOrBelow)) raw[e.position]++;
    }
  }
  const total = POSITIONS.reduce((n, p) => n + raw[p], 0);
  const reserve = Math.min(Math.max(0, Math.floor(settings.d2Reserve)), total);
  if (reserve === 0) return raw;
  const exact = POSITIONS.map(p => (raw[p] * reserve) / total);
  const take = exact.map(Math.floor);
  let left = reserve - take.reduce((a, b) => a + b, 0);
  const byRemainder = POSITIONS.map((_, i) => i).sort((a, b) => (exact[b] - take[b]) - (exact[a] - take[a]) || a - b);
  for (const i of byRemainder) {
    if (left === 0) break;
    if (take[i] < raw[POSITIONS[i]]) {
      take[i]++;
      left--;
    }
  }
  return Object.fromEntries(POSITIONS.map((p, i) => [p, Math.max(0, raw[p] - take[i])])) as Record<Position, number>;
}

const scoreOf = (p: DraftProspect) => boosted(p.collegeRating, p.classYear) ?? -Infinity;

/**
 * The prospects in ranking order: by college rating plus the class boost (a missing rating last, equal scores keep the input order, so pass them
 * in the draft board's order), then the commissioner's own order applied: the players in `manualOrder` take the places the listed players hold, in
 * that order. A prospect who isn't listed (a late entrant) keeps his score place; a listed player who is gone is ignored.
 */
export function rankedProspects(prospects: DraftProspect[], manualOrder: string[] = []): DraftProspect[] {
  const base = prospects.map((p, i) => ({ p, i })).sort((a, b) => scoreOf(b.p) - scoreOf(a.p) || a.i - b.i).map(x => x.p);
  const present = new Map(base.map(p => [p.playerId, p]));
  const listed = manualOrder.filter((id, k) => present.has(id) && manualOrder.indexOf(id) === k);
  if (listed.length < 2) return base;
  const listedSet = new Set(listed);
  const fill = listed.map(id => present.get(id)!);
  let next = 0;
  return base.map(p => (listedSet.has(p.playerId) ? fill[next++] : p));
}

/**
 * Each prospect's overall and position rank (by college rating plus the class boost; a missing rating last; equal scores keep the input order,
 * so pass them in the draft board's order) and, for an early entrant, the stay / close / withdraw signal: both checks (position rank within
 * the spots at his position, overall rank within the history cutoff) is `stay`, one is `close`, neither is `withdraw`.
 */
export function prospectOutlook(
  prospects: DraftProspect[], fba: RostersFile, settings: OutlookSettings = DEFAULT_OUTLOOK, manualOrder: string[] = [],
): Map<string, ProspectOutlook> {
  const spots = positionSpots(fba, settings);
  const ranked = rankedProspects(prospects, manualOrder);
  const seen = new Map<Position, number>();
  const out = new Map<string, ProspectOutlook>();
  ranked.forEach((p, k) => {
    const positionRank = (seen.get(p.position) ?? 0) + 1;
    seen.set(p.position, positionRank);
    const positionCheck = positionRank <= spots[p.position];
    const historyCheck = k + 1 <= settings.historyCutoff;
    out.set(p.playerId, {
      overallRank: k + 1,
      positionRank,
      spots: spots[p.position],
      positionCheck,
      historyCheck,
      signal: p.senior ? null : positionCheck && historyCheck ? 'stay' : positionCheck || historyCheck ? 'close' : 'withdraw',
    });
  });
  return out;
}
