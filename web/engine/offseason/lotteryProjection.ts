/**
 * Exact odds for the picks still hidden while the lottery is revealed.
 *
 * The draw (`drawLottery`) is sequential and weighted: pick 1 by the weights, winner removed, the rest re-normalised, and so on,
 * which is a Plackett-Luce ranking. The reveal goes from the last pick down, so after some reveals the last picks are known.
 * Conditional on that suffix, an ordering pi of the m hidden teams (picks 1..m) has probability proportional to
 * prod_k w(pi_k) / (U_k + C), with U_k the weight of the hidden teams not yet placed and C the weight of the revealed teams.
 * The marginals come from a subset DP over bitmasks.
 */
export interface TeamProjection {
  teamId: string;
  /** P(team gets pick j) for j = 1..m (index j-1), summing to 1 over j; m = teams still hidden. */
  pickProbs: number[];
  pFirst: number;
  /** Expected pick, 1-based. */
  expected: number;
  /** The most likely pick (ties: the better pick). */
  likely: { pick: number; p: number };
  /** Smallest pick with p > 0, 1-based. */
  best: number;
  /** Largest pick with p > 0. */
  worst: number;
}

export interface LotteryProjection {
  /** Teams not yet revealed, by pFirst descending then teamId. */
  hidden: TeamProjection[];
  /** Pick 1..m, the top 3 teams by probability, descending. */
  perPick: { pick: number; top: { teamId: string; p: number }[] }[];
}

const MAX_HIDDEN = 20;
const TIE = 1e-12;

export function lotteryProjection(odds: { teamId: string; pct: number }[], revealed: string[]): LotteryProjection {
  const known = new Set(odds.map(o => o.teamId));
  const seen = new Set<string>();
  for (const id of revealed) {
    if (!known.has(id)) throw new Error(`Revealed team ${id} is not in the lottery`);
    if (seen.has(id)) throw new Error(`Revealed team ${id} appears more than once`);
    seen.add(id);
  }
  const hiddenOdds = odds.filter(o => !seen.has(o.teamId));
  const m = hiddenOdds.length;
  if (m > MAX_HIDDEN) throw new Error(`Too many teams to project (${m})`);
  if (m === 0) return { hidden: [], perPick: [] };

  const w = hiddenOdds.map(o => Math.max(0, o.pct));
  const C = odds.filter(o => seen.has(o.teamId)).reduce((s, o) => s + Math.max(0, o.pct), 0);
  const size = 1 << m;
  const full = size - 1;

  // wsum[S]: total weight of the hidden teams in S.
  const wsum = new Float64Array(size);
  for (let s = 1; s < size; s++) {
    const low = s & -s;
    wsum[s] = wsum[s ^ low] + w[31 - Math.clz32(low)];
  }
  // Probability that team i is drawn next when S is already placed (the rest, plus the revealed teams, are in the pool).
  const factor = (i: number, s: number): number => {
    const denom = wsum[full ^ s] + C;
    return denom > 0 ? w[i] / denom : 1;
  };

  const f = new Float64Array(size);
  f[0] = 1;
  for (let s = 0; s < size; s++) {
    if (f[s] === 0) continue;
    for (let i = 0; i < m; i++) if (!(s & (1 << i))) f[s | (1 << i)] += f[s] * factor(i, s);
  }
  const g = new Float64Array(size);
  g[full] = 1;
  for (let s = full - 1; s >= 0; s--) {
    let sum = 0;
    for (let i = 0; i < m; i++) if (!(s & (1 << i))) sum += factor(i, s) * g[s | (1 << i)];
    g[s] = sum;
  }

  const z = f[full];
  const probs: number[][] = hiddenOdds.map(() => Array<number>(m).fill(0));
  if (z > 0) {
    const pop = new Uint8Array(size);
    for (let s = 1; s < size; s++) pop[s] = pop[s >> 1] + (s & 1);
    for (let s = 0; s < size; s++) {
      if (f[s] === 0) continue;
      const j = pop[s];
      for (let i = 0; i < m; i++) {
        if (s & (1 << i)) continue;
        probs[i][j] += (f[s] * factor(i, s) * g[s | (1 << i)]) / z;
      }
    }
  } else {
    // Every ordering has probability zero (a zero-weight team that could not have been drawn yet): fall back to even odds.
    for (const row of probs) row.fill(1 / m);
  }

  const hidden: TeamProjection[] = hiddenOdds.map((o, i) => {
    const p = probs[i];
    let likely = 0;
    let best = -1;
    let worst = -1;
    let expected = 0;
    for (let j = 0; j < m; j++) {
      expected += p[j] * (j + 1);
      if (p[j] > p[likely] + TIE) likely = j;
      if (p[j] > 0) {
        if (best < 0) best = j;
        worst = j;
      }
    }
    return {
      teamId: o.teamId,
      pickProbs: p,
      pFirst: p[0],
      expected,
      likely: { pick: likely + 1, p: p[likely] },
      best: best + 1,
      worst: worst + 1,
    };
  });
  hidden.sort((a, b) => b.pFirst - a.pFirst || (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));

  const perPick = Array.from({ length: m }, (_, j) => ({
    pick: j + 1,
    top: hidden
      .map(t => ({ teamId: t.teamId, p: t.pickProbs[j] }))
      .sort((a, b) => b.p - a.p || (a.teamId < b.teamId ? -1 : 1))
      .slice(0, 3),
  }));
  return { hidden, perPick };
}
