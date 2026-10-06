import type { PickCondition, RosterEntry, RostersFile } from '../shared/types';
import { RETIRE_AGE } from './rules';
import type { RosterState } from './state';
import type { TradeAsset } from './trade';

/**
 * Trade values are in one made-up unit: an 80-rated player in his prime is about 40, and a first-overall pick is about the same.
 * They only say whether a trade is roughly even; they are not a price list.
 */
const PICK_TOP = 40;
const PICK_DECAY = 0.93;
const AVERAGE_SLOT = 15.5;

/** Rating drives value steeply (a 90 is worth over twice an 80), so one star can outweigh two good players. */
const ratingValue = (rating: number): number => Math.max(0, rating - 60) ** 2 / 10;

/** Full value up to age 24, falling to just over half at the retirement age (players retire after the season they play at RETIRE_AGE). */
const ageFactor = (age: number | null): number => (age === null ? 0.8 : 0.55 + 0.45 * Math.max(0, Math.min(1, (RETIRE_AGE - age) / 8)));

/** What a player of this rating is paid on a typical contract, topping out at the $8 maximum. */
const marketAmount = (rating: number): number => Math.min(8, Math.max(1, 0.25 * (rating - 58)));

/** The worth of one FBA player to a team: rating, scaled by age, plus the surplus of a below-market contract over its first three years. */
export function playerValue(e: RosterEntry, season: number): number {
  if (e.rating === null) return 0;
  const years = e.contractEnd == null ? 0 : Math.max(0, e.contractEnd - season + 1);
  const surplus = e.contractAmount == null ? 0 : (marketAmount(e.rating) - e.contractAmount) * Math.min(years, 3) * 2;
  return Math.max(1, ratingValue(e.rating) * ageFactor(e.age) + surplus);
}

/** Each team's rank by average rating: 1 is the weakest, so the likeliest to hold the best pick. */
export function teamRanks(rosters: RostersFile): Map<string, number> {
  const avg = Object.entries(rosters.teams).map(([teamId, entries]) => {
    const rated = entries.filter(e => e.playerId !== null && e.rating !== null);
    return [teamId, rated.length ? rated.reduce((s, e) => s + e.rating!, 0) / rated.length : 0] as const;
  });
  avg.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return new Map(avg.map(([teamId], i) => [teamId, i + 1]));
}

const slotValue = (slot: number): number => PICK_TOP * PICK_DECAY ** (slot - 1);

/**
 * The worth of a pick from `originalTeam` in the `pickSeason` draft: its projected slot (the team's rank now, drifting a quarter of the way toward the
 * middle for each extra year out), cut by how likely a protection is to keep it. A swap is worth only the gap between the better and the worse pick,
 * and only to the team that gets the better one; a custom condition counts for 70%.
 */
export function pickValue(originalTeam: string, pickSeason: number, condition: PickCondition, season: number, ranks: Map<string, number>, receiver?: string): number {
  const teams = Math.max(ranks.size, 2);
  const years = Math.max(1, pickSeason - season);
  const drift = Math.min(1, 0.25 * (years - 1));
  const project = (team: string): number => {
    const rank = ranks.get(team) ?? AVERAGE_SLOT;
    return rank + (AVERAGE_SLOT - rank) * drift;
  };
  const slot = project(originalTeam);
  switch (condition.kind) {
    case 'none': return slotValue(slot);
    case 'top': case 'lottery': {
      const n = condition.kind === 'top' ? condition.n : Math.min(14, teams);
      // Conveys only when the pick lands below the protected slots, with about half a draft's worth of uncertainty either way.
      const conveys = Math.max(0.05, Math.min(1, (slot - n) / (teams / 2) + 0.5));
      return slotValue(slot) * conveys;
    }
    case 'swap': {
      const other = project(condition.otherTeam);
      const gap = slotValue(Math.min(slot, other)) - slotValue(Math.max(slot, other));
      return receiver === undefined || condition.betterTo === receiver ? gap : 0;
    }
    case 'custom': return slotValue(slot) * 0.7;
  }
}

export interface TradeSide { teamId: string; receives: number; gives: number; /** receives − gives: positive means the team comes out ahead. */ net: number }
export type TradeVerdict = 'fair' | 'slight' | 'clear' | 'lopsided';
export interface TradeAssessment {
  sides: TradeSide[];
  /** The total value changing hands. */
  moved: number;
  /** The team that comes out furthest ahead, or null when the trade is fair. */
  favoured: string | null;
  /** How far from even, from 0 (equal) to 1 (a pure gift): the best team's net gain over the value moved. */
  imbalance: number;
  verdict: TradeVerdict;
}

const verdictFor = (imbalance: number): TradeVerdict => (imbalance <= 0.1 ? 'fair' : imbalance <= 0.25 ? 'slight' : imbalance <= 0.5 ? 'clear' : 'lopsided');

/** How even a trade is, from the value each team gives up and receives. Null when nothing is being traded. */
export function assessTrade(state: RosterState, input: { teams: string[]; assets: TradeAsset[] }): TradeAssessment | null {
  if (input.assets.length === 0) return null;
  const ranks = teamRanks(state.fba);
  const sides = new Map(input.teams.map(teamId => [teamId, { teamId, receives: 0, gives: 0, net: 0 }]));
  let moved = 0;
  for (const a of input.assets) {
    let value = 0;
    if (a.kind === 'player') {
      const e = state.fba.teams[a.from]?.find(x => x.playerId === a.playerId);
      value = e ? playerValue(e, state.season) : 0;
    } else if (a.kind === 'pick') {
      const o = state.picks.obligations.find(x => x.id === a.obligationId);
      value = o ? pickValue(o.originalTeam, o.season, o.condition, state.season, ranks, a.to) : 0;
    } else {
      value = pickValue(a.from, a.season, a.condition, state.season, ranks, a.to);
    }
    const from = sides.get(a.from), to = sides.get(a.to);
    if (!from || !to) continue;
    from.gives += value;
    to.receives += value;
    moved += value;
  }
  const list = [...sides.values()].map(s => ({ ...s, net: s.receives - s.gives }));
  const best = list.reduce((m, s) => (s.net > m.net ? s : m), list[0]);
  const imbalance = moved > 0 ? Math.min(1, best.net / moved) : 0;
  const verdict = verdictFor(imbalance);
  return { sides: list, moved, favoured: verdict === 'fair' ? null : best.teamId, imbalance, verdict };
}
