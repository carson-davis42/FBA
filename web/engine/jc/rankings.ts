import { shuffle, type Rng } from '../d2/random';
import type { GameResult, RosterEntry } from '../shared/types';

/** Average rating of the five starters (null counts 0). */
export function teamRating(roster: RosterEntry[]): number {
  const five = roster.slice(0, 5);
  let sum = 0;
  for (const e of five) sum += e.rating ?? 0;
  return sum / 5;
}

/** Weight of the win-graph ranker in the blend: 0 up to 5% of games, 1 from 65%, smoothstep between. */
export function frWeight(progress: number): number {
  const start = 0.05;
  const full = 0.65;
  if (progress <= start) return 0;
  if (progress >= full) return 1;
  const x = (progress - start) / (full - start);
  return x * x * (3 - 2 * x);
}

/** Port of FootballRanker.doWeightedAndWinPercentAdjusted: best first; unconnected teams follow in input order. */
export function footballRank(teams: string[], games: GameResult[]): string[] {
  const edges = new Map<string, Map<string, number>>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1); };
  for (const game of games) {
    const diff = game.homePts - game.awayPts;
    if (diff === 0) continue;
    let by = Math.trunc(diff / 8);
    if (by === 0) by = 1;
    const cost = Math.abs(1 / by);
    const [w, l] = diff > 0 ? [game.home, game.away] : [game.away, game.home];
    let out = edges.get(w);
    if (!out) { out = new Map(); edges.set(w, out); }
    out.set(l, cost); // a later game replaces the edge cost, as in Graph.addEdge
    inc(wins, w);
    inc(losses, l);
  }
  const names = new Set<string>();
  for (const [w, out] of edges) { names.add(w); for (const l of out.keys()) names.add(l); }

  const scored: { name: string; ave: number }[] = [];
  for (const start of names) {
    const dist = new Map<string, number>([[start, 0]]);
    const done = new Set<string>();
    for (;;) {
      let cur: string | null = null;
      let best = Infinity;
      for (const [v, d] of dist) if (!done.has(v) && d < best) { best = d; cur = v; }
      if (cur === null) break;
      done.add(cur);
      for (const [n, c] of edges.get(cur) ?? []) {
        const nd = best + c;
        if (nd < (dist.get(n) ?? Infinity)) dist.set(n, nd);
      }
    }
    let count = 0;
    let total = 0;
    for (const [v, d] of dist) if (v !== start && d !== 0) { count++; total += d; }
    if (count === 0) continue;
    const w = wins.get(start) ?? 0;
    const pct = (1.0 * w) / (w + (losses.get(start) ?? 0));
    scored.push({ name: start, ave: (total / count) * (1.0 / pct) });
  }
  scored.sort((a, b) => (a.ave < b.ave ? -1 : a.ave > b.ave ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const order = scored.map(s => s.name);
  const seen = new Set(order);
  for (const t of teams) if (!seen.has(t)) order.push(t);
  return order;
}

export interface BlendInput {
  teams: string[];
  ratings: Record<string, number>;
  games: GameResult[];
  totalGames: number;
}

/** Port of Main.updateRankings blend; lower blended rank is better. */
export function blendRankings(input: BlendInput, rng: Rng): string[] {
  const { teams, ratings, games, totalGames } = input;
  const fr = footballRank(teams, games);
  const ratingOrder = shuffle(teams, rng).sort((a, b) => (ratings[b] ?? 0) - (ratings[a] ?? 0));
  const fw = frWeight(games.length / totalGames);
  const rw = 1.0 - fw;
  const ratingRank = new Map(ratingOrder.map((t, i) => [t, i + 1]));
  const frRank = new Map(fr.map((t, i) => [t, i + 1]));
  const score = (t: string): number => rw * (ratingRank.get(t) ?? 0) + fw * (frRank.get(t) ?? 0);
  return [...teams].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    const f = (frRank.get(a) ?? 0) - (frRank.get(b) ?? 0);
    if (f !== 0) return f;
    return (ratings[b] ?? 0) - (ratings[a] ?? 0);
  });
}

export interface RankChange { teamId: string; rank: number; change: string }

/** Top-25 rows with movement versus the previous poll. */
export function rankChanges(prev: string[] | null, cur: string[]): RankChange[] {
  const prevTop = prev ? prev.slice(0, 25) : [];
  return cur.slice(0, 25).map((teamId, i) => {
    const p = prevTop.indexOf(teamId);
    const diff = p < 0 ? 0 : p - i;
    const change = p < 0 ? 'NR' : diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '--';
    return { teamId, rank: i + 1, change };
  });
}

/** Teams that were in the previous top 25 and are not in the current one. */
export function dropped(prev: string[] | null, cur: string[]): string[] {
  if (!prev) return [];
  const now = new Set(cur.slice(0, 25));
  return prev.slice(0, 25).filter(t => !now.has(t));
}
