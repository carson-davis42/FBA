/**
 * Power rankings: a port of the Java FootballRanker.doWeightedAndWinPercentAdjusted
 * (FBA/src/fba/FootballRanker.java with Graph.java). An edge runs from each game's winner to its loser,
 * costing less the more lopsided the win; each team's average shortest-path cost to every team it
 * reaches is divided by its win percentage. Lower is better.
 */

export interface RankGame { home: string; away: string; homePts: number; awayPts: number }

/** The Java's TD_PLUS: every 8 points of margin halves (then thirds, …) the edge cost. */
const TD_PLUS = 8;

/** Dijkstra from `start`; returns the cost to every reachable team (start included at 0). */
function shortestPaths(edges: Map<string, Map<string, number>>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [team, d] of dist) {
      if (!done.has(team) && d < best) {
        best = d;
        cur = team;
      }
    }
    if (cur === null) return dist;
    done.add(cur);
    for (const [next, cost] of edges.get(cur) ?? []) {
      const d = best + cost;
      if (d < (dist.get(next) ?? Infinity)) dist.set(next, d);
    }
  }
}

/** Teams best-first. A team with no wins reaches nobody, so (as in the Java) it isn't ranked. */
export function powerRankings(games: RankGame[]): string[] {
  const edges = new Map<string, Map<string, number>>();
  const record = new Map<string, { w: number; l: number }>();
  for (const g of games) {
    const diff = g.homePts - g.awayPts;
    if (diff === 0) continue;
    for (const t of [g.home, g.away]) {
      if (!record.has(t)) record.set(t, { w: 0, l: 0 });
      if (!edges.has(t)) edges.set(t, new Map());
    }
    let by = Math.trunc(diff / TD_PLUS);
    if (by === 0) by = 1;
    const [winner, loser] = diff > 0 ? [g.home, g.away] : [g.away, g.home];
    // A later game between the same winner and loser replaces the edge, as Graph.addEdge does.
    edges.get(winner)!.set(loser, Math.abs(1 / by));
    record.get(winner)!.w++;
    record.get(loser)!.l++;
  }
  const scored: { team: string; score: number }[] = [];
  for (const start of edges.keys()) {
    let paths = 0;
    let total = 0;
    for (const [team, d] of shortestPaths(edges, start)) {
      if (team !== start && d > 0) {
        paths++;
        total += d;
      }
    }
    if (paths === 0) continue;
    const r = record.get(start)!;
    scored.push({ team: start, score: (total / paths) * (1 / (r.w / (r.w + r.l))) });
  }
  scored.sort((a, b) => a.score - b.score || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0));
  return scored.map(s => s.team);
}
