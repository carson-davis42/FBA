import { mulberry32 } from '../d2/random';
import { lineup } from '../season/moves';
import type { SeasonLeague } from '../season/schedule';
import { simGame } from '../season/sim';
import { GROUP_ORDER } from '../season/standings';
import type { SeasonState } from '../season/state';
import { seasonStateFor } from '../season/testFixtures';
import { nextPlayoffGame, recordPlayoffGame } from './moves';

function teamsFor(league: SeasonLeague, perGroup: number): [string, string][] {
  return GROUP_ORDER[league].flatMap(g => Array.from({ length: perGroup }, (_, k): [string, string] => [`${g}${String(k + 1).padStart(2, '0')}`, g]));
}

function ratingsFor(list: [string, string][], seed: number, lo: number, hi: number): Record<string, number[]> {
  const rng = mulberry32(seed);
  return Object.fromEntries(list.map(([id]) => [id, Array.from({ length: 5 }, () => lo + Math.floor(rng() * (hi - lo + 1)))]));
}

/** The real FBA shape: 15 teams per conference, 86 games each (1290 in all), with the default pauses. */
export function fullFbaState(seed = 7): SeasonState {
  const list = teamsFor('fba', 15);
  return seasonStateFor('fba', list, ratingsFor(list, seed, 70, 99), 1);
}

/** The real D2 shape: 16 teams in each of PL, WL, UL and IL, 30 games each (960 in all). */
export function fullD2State(seed = 8): SeasonState {
  const list = teamsFor('fbad2', 16);
  return seasonStateFor('fbad2', list, ratingsFor(list, seed, 50, 90), 1001);
}

/** Every regular-season game saved with made-up scores (no box scores), and every pause done unless told otherwise. */
export function regularSeasonDone(state: SeasonState, seed = 3, opts: { lastPauseOpen?: boolean } = {}): SeasonState {
  const rng = mulberry32(seed);
  const games = state.schedule!.games.map(g => {
    const homePts = 60 + Math.floor(rng() * 40);
    let awayPts = 60 + Math.floor(rng() * 40);
    if (awayPts === homePts) awayPts++;
    return { gameNo: g.gameNo, home: g.home, away: g.away, homePts, awayPts };
  });
  const pauses = state.schedule!.pauses.map((p, i, all) => ({ ...p, done: !(opts.lastPauseOpen && i === all.length - 1) }));
  return { ...state, results: { ...state.results!, games }, schedule: { ...state.schedule!, pauses } };
}

/** Plays up to `maxGames` playoff games (all of them by default) through the real moves. */
export function playPlayoffs(state: SeasonState, seed = 5, maxGames = Infinity): SeasonState {
  const rng = mulberry32(seed);
  let s = state;
  for (let n = 0; n < maxGames; n++) {
    const next = nextPlayoffGame(s.playoffs);
    if (!next) break;
    const home = lineup(s, next.home);
    const away = lineup(s, next.away);
    if (typeof home === 'string' || typeof away === 'string') throw new Error(`${String(home)} / ${String(away)}`);
    const r = recordPlayoffGame(s, simGame(next.gameNo, home, away, rng));
    if (!r.ok) throw new Error(r.problems.join('; '));
    s = r.state;
  }
  return s;
}
