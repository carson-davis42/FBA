import { makeChance, type SimGame } from '../season/sim';
import type { ResultsFile, RostersFile } from '../shared/types';

export interface DefenseLine { def: number; stops: number; allowed: number; exp: number }

/**
 * Expected points of one shot at this make chance, in hundredths. A shot is made when the 1–100 roll is at most
 * `odds` (2 points) and is a three when odds − roll ≥ 30, so E = (2·odds + max(0, odds − 30)) / 100.
 */
export const expHundredths = (odds: number): number => 2 * odds + Math.max(0, odds - 30);

/** Each player's defensive line for one game, in the same order as the box score. */
export function defenseLines(g: SimGame, refRating: number): { home: DefenseLine[]; away: DefenseLine[] } {
  const zero = (n: number) => Array.from({ length: n }, () => ({ def: 0, stops: 0, allowed: 0, exp: 0 }));
  const out = { home: zero(g.home.players.length), away: zero(g.away.players.length) };
  for (const p of g.possessions) {
    const offense = p.offense === 'home' ? g.home : g.away;
    const d = out[p.offense === 'home' ? 'away' : 'home'][p.defender];
    d.def++;
    if (!p.made) d.stops++;
    d.allowed += p.points;
    d.exp += expHundredths(makeChance(offense.players[p.handler].rating, refRating));
  }
  return out;
}

/** The "average defender" for points saved: the rounded mean rating of the league's rated rostered players. */
export function leagueRefRating(rosters: RostersFile): number {
  const ratings = Object.values(rosters.teams).flat().filter(e => e.playerId !== null && e.rating !== null).map(e => e.rating!);
  return ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 80;
}

export interface DefenseTotals { games: number; def: number; stops: number; allowed: number; exp: number }

/** Season defensive totals per player, over box lines that carry defensive stats (older games don't). */
export function seasonDefense(results: ResultsFile | null): Map<string, DefenseTotals> {
  const out = new Map<string, DefenseTotals>();
  for (const g of results?.games ?? []) {
    for (const line of [...(g.box?.home ?? []), ...(g.box?.away ?? [])]) {
      if (line.def === undefined) continue;
      const t = out.get(line.playerId) ?? { games: 0, def: 0, stops: 0, allowed: 0, exp: 0 };
      t.games++;
      t.def += line.def;
      t.stops += line.stops ?? 0;
      t.allowed += line.allowed ?? 0;
      t.exp += line.exp ?? 0;
      out.set(line.playerId, t);
    }
  }
  return out;
}

/** Points saved per game against an average defender facing the same shots. */
export function pointsSavedPerGame(t: DefenseTotals): number {
  return t.games ? (t.exp / 100 - t.allowed) / t.games : 0;
}
