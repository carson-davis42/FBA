import type { SeasonLeague } from '../season/schedule';
import { groupLabel } from '../shared/leagues';
import type { PlayoffSeed, PlayoffSeries } from '../shared/types';

/** Seed pairs of the first round, as series -R1-1 … -R1-4. */
export const PAIRS: [number, number][] = [[1, 8], [2, 7], [3, 6], [4, 5]];
export const FINALS = 'FINALS';

/** A group's last series: FBA conference finals, D2 league final. */
export const finalId = (league: SeasonLeague, group: string): string => (league === 'fba' ? `${group}-CF` : `${group}-F`);

const empty = (id: string, group: string | null, round: number, next: string | null): PlayoffSeries => ({
  id, group, round, home: null, away: null, homeSeed: null, awaySeed: null, homeWins: 0, awayWins: 0, winner: null, next,
});

/**
 * The NHL-style first round: the division winner with the better seed (W1) plays the second wild card, the other winner (W2) the first;
 * inside each division 2nd plays 3rd. Series 1 and 3 are W1's division, 2 and 4 W2's.
 */
function divisionPairs(divisions: { division: string; teams: string[] }[], wildCards: string[], seeded: string[]): [string, string][] {
  const [w1, w2] = [...divisions].sort((a, b) => seeded.indexOf(a.teams[0]) - seeded.indexOf(b.teams[0]));
  return [[w1.teams[0], wildCards[1]], [w2.teams[0], wildCards[0]], [w1.teams[1], w1.teams[2]], [w2.teams[1], w2.teams[2]]];
}

/** The fixed bracket (Java whereToNext): 1/8 meets 4/5, 2/7 meets 3/6; conference champions meet in the Finals. */
export function buildBracket(league: SeasonLeague, seeds: Pick<PlayoffSeed, 'group' | 'teams' | 'divisions' | 'wildCards'>[]): { series: PlayoffSeries[]; queue: string[] } {
  const series: PlayoffSeries[] = [];
  for (const seed of seeds) {
    const { group, teams } = seed;
    const top = finalId(league, group);
    if (seed.divisions && seed.wildCards) {
      for (const [k, [a, b]] of divisionPairs(seed.divisions, seed.wildCards, teams).entries()) {
        const [hi, lo] = teams.indexOf(a) < teams.indexOf(b) ? [a, b] : [b, a];
        series.push({ ...empty(`${group}-R1-${k + 1}`, group, 1, `${group}-SF-${k % 2 === 0 ? 1 : 2}`), home: hi, away: lo, homeSeed: teams.indexOf(hi) + 1, awaySeed: teams.indexOf(lo) + 1 });
      }
      series.push(empty(`${group}-SF-1`, group, 2, top), empty(`${group}-SF-2`, group, 2, top), empty(top, group, 3, FINALS));
      continue;
    }
    PAIRS.forEach(([h, a], k) => {
      series.push({ ...empty(`${group}-R1-${k + 1}`, group, 1, `${group}-SF-${k === 0 || k === 3 ? 1 : 2}`), home: teams[h - 1], away: teams[a - 1], homeSeed: h, awaySeed: a });
    });
    series.push(empty(`${group}-SF-1`, group, 2, top), empty(`${group}-SF-2`, group, 2, top));
    series.push(empty(top, group, 3, league === 'fba' ? FINALS : null));
  }
  if (league === 'fba') series.push(empty(FINALS, null, 4, null));
  const queue = PAIRS.flatMap((_, k) => seeds.map(s => `${s.group}-R1-${k + 1}`));
  return { series, queue };
}

/** 2-2-1-1-1: the other team hosts games 3, 4 and 6 (the Java swaps when 2, 3 or 5 games are played). */
export function hostOf(s: PlayoffSeries, gameInSeries: number): { home: string; away: string } {
  if (!s.home || !s.away) throw new Error(`${s.id} doesn't have both teams yet`);
  return [3, 4, 6].includes(gameInSeries) ? { home: s.away, away: s.home } : { home: s.home, away: s.away };
}

/**
 * Records one game's winner and moves the bracket on, the Java way: the series leaves the front of the
 * queue and goes to the back unless it's over; a finished series' winner fills its next slot (lower seed
 * number at home, or `better` for the Finals) and the next series joins the queue once both teams are known.
 */
export function advance(
  pf: { series: PlayoffSeries[]; queue: string[] },
  seriesId: string,
  winnerId: string,
  better: (a: string, b: string) => boolean,
): { series: PlayoffSeries[]; queue: string[] } {
  const series = pf.series.map(s => ({ ...s }));
  const byId = new Map(series.map(s => [s.id, s]));
  const s = byId.get(seriesId);
  if (!s) throw new Error(`Unknown series ${seriesId}`);
  if (winnerId === s.home) s.homeWins++;
  else s.awayWins++;
  let queue = pf.queue.filter(id => id !== seriesId);
  if (s.homeWins < 4 && s.awayWins < 4) return { series, queue: [...queue, seriesId] };
  s.winner = winnerId;
  const seed = winnerId === s.home ? s.homeSeed : s.awaySeed;
  const next = s.next ? byId.get(s.next) : undefined;
  if (next) {
    if (next.home === null) {
      next.home = winnerId;
      next.homeSeed = seed;
    } else {
      const other = next.home;
      const otherSeed = next.homeSeed;
      const winnerFirst = next.id === FINALS ? better(winnerId, other) : (seed ?? 9) < (otherSeed ?? 9);
      if (winnerFirst) {
        next.home = winnerId;
        next.homeSeed = seed;
        next.away = other;
        next.awaySeed = otherSeed;
      } else {
        next.away = winnerId;
        next.awaySeed = seed;
      }
      queue = [...queue, next.id];
    }
  }
  return { series, queue };
}

/** True for a bracket built from divisions (S80 on): round 2 is the division finals. */
export const isDivisional = (seeds: Pick<PlayoffSeed, 'divisions'>[]): boolean => seeds.some(s => !!s.divisions);

const ROUND = ['first round', 'semifinals'];

/** "East first round", "West conference finals", "FBA Finals", "Premier League final". */
export function roundName(league: SeasonLeague, s: PlayoffSeries, divisional = false): string {
  if (s.id === FINALS) return 'FBA Finals';
  const where = league === 'fba' ? (s.group === 'E' ? 'East' : 'West') : groupLabel('fbad2', s.group);
  const round = s.round === 2 && divisional ? 'division finals' : s.round <= 2 ? ROUND[s.round - 1] : league === 'fba' ? 'conference finals' : 'final';
  return `${where} ${round}`;
}

/** A group's series as bracket columns, ordered so each pair feeds the box beside it. */
export function bracketColumns(league: SeasonLeague, group: string, divisional = false): string[][] {
  return [
    divisional ? [`${group}-R1-1`, `${group}-R1-3`, `${group}-R1-2`, `${group}-R1-4`] : [`${group}-R1-1`, `${group}-R1-4`, `${group}-R1-2`, `${group}-R1-3`],
    [`${group}-SF-1`, `${group}-SF-2`],
    [finalId(league, group)],
  ];
}
