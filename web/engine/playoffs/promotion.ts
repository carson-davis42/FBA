import type { PromotionLine } from '../shared/types';

/** The D2 leagues, top tier first. */
export const TIERS = ['PL', 'WL', 'UL', 'IL'];

/**
 * The S78 rule (Java printSeasonSummary). `order` is each league's final regular-season order, best first;
 * `champions` is each league's playoff champion. Below the top tier, #1 and the playoff champion go up
 * (#2 if #1 won the playoffs); above the bottom tier, the last two go down.
 */
export function promotion(order: Record<string, string[]>, champions: Record<string, string>): PromotionLine[] {
  return TIERS.map((league, k) => {
    const o = order[league] ?? [];
    const champ = champions[league];
    const promoted = k === 0 || o.length < 2 ? [] : [o[0], champ === o[0] ? o[1] : champ];
    const relegated = k === TIERS.length - 1 ? [] : o.slice(-2);
    return { league, promoted, relegated };
  });
}
