/** Java getAwardScore: 60% scoring, 20% rating, 20% team success (win% × 100). */
export function awardScore(ppg: number, rating: number, winPct: number): number {
  return ppg * 0.6 + rating * 0.2 + winPct * 100 * 0.2;
}

/** Java toAmericanOdds. */
export function americanOdds(probability: number): string {
  const p = Math.max(0.0001, Math.min(0.9999, probability));
  let odds = p > 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  if (odds > 10000) odds = 10000;
  if (odds < -5000) odds = -5000;
  return odds > 0 ? `+${odds}` : String(odds);
}

/**
 * Java printAwardRace odds for scores sorted best-first (at most 10). The top 8 share the probability through
 * exp((score − best) / 2); places 1–6 show at most +6000 and 7–8 at most +8000; everyone after the pool is +10000.
 */
export function raceOdds(scores: number[]): string[] {
  if (!scores.length) return [];
  const pool = Math.min(8, scores.length);
  const best = scores[0];
  const weights = scores.slice(0, pool).map(s => Math.exp((s - best) / 2));
  const total = weights.reduce((a, b) => a + b, 0);
  return scores.map((_, i) => {
    if (i >= pool) return '+10000';
    let odds = americanOdds(weights[i] / total);
    const numeric = Number(odds.replace('+', ''));
    if (numeric > 6000 && i < 6) odds = '+6000';
    else if (numeric > 8000 && i < 8) odds = '+8000';
    return odds;
  });
}
