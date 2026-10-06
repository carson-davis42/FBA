import { FBA_PROFILE, shotOdds, type SimGame } from './sim';

export interface ScoringLine {
  att: number;
  /** Expected points on the player's actual shots, in hundredths. */
  offExp: number;
  /** Sum of independent shot variances, in ten-thousandths. */
  offVar: number;
}

/** Moments of the simulation's 100 equally likely shot rolls. */
export function shotMoments(odds: number, rollOffset = 1): { exp: number; variance: number } {
  const made = Math.max(0, Math.min(100, odds - rollOffset + 1));
  const threes = Math.max(0, Math.min(100, odds - 30 - rollOffset + 1));
  const exp = 2 * made + threes;
  const second = 4 * made + 5 * threes;
  return { exp, variance: second * 100 - exp * exp };
}

/** Shot opportunities and expectations use the actual lineups at game time, including trades and rating changes. */
export function scoringLines(g: SimGame): { home: ScoringLine[]; away: ScoringLine[] } {
  const zero = (n: number) => Array.from({ length: n }, () => ({ att: 0, offExp: 0, offVar: 0 }));
  const out = { home: zero(g.home.players.length), away: zero(g.away.players.length) };
  const profile = g.profile ?? FBA_PROFILE;
  for (const p of g.possessions) {
    const offense = g[p.offense];
    const defense = g[p.offense === 'home' ? 'away' : 'home'];
    const line = out[p.offense][p.handler];
    const moments = shotMoments(shotOdds(offense, p.handler, defense, p.defender, profile), profile.rollOffset);
    line.att++;
    line.offExp += moments.exp;
    line.offVar += moments.variance;
  }
  return out;
}
