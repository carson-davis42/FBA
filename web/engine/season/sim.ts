import type { Rng } from '../d2/random';
import type { Position } from '../shared/types';

export const REGULATION = 120;
export const QUARTER = 30;
export const OT_LENGTH = 10;
/** A safety net only: real games never get close. */
const MAX_POSSESSIONS = 2000;

export interface SimPlayer { playerId: string; position: Position; rating: number }
/** Exactly five players, in PG, SG, SF, PF, C order. */
export interface SimTeam { teamId: string; players: SimPlayer[] }
export type Side = 'home' | 'away';

export interface Possession {
  i: number;
  period: number;
  offense: Side;
  /** Index into the offense's players. */
  handler: number;
  /** Index into the defense's players. */
  defender: number;
  made: boolean;
  points: 0 | 2 | 3;
  homeScore: number;
  awayScore: number;
  /** Was this possession in the clutch window (checked before it was played)? */
  clutch: boolean;
  /** The game's final possession count as known after this possession. */
  end: number;
}

export interface SimGame {
  /** Needed to interpret shot expectations; absent on older transient game objects means FBA. */
  profile?: SimProfile;
  gameNo: number;
  home: SimTeam;
  away: SimTeam;
  possessions: Possession[];
  homePts: number;
  awayPts: number;
  ot: number;
  periods: { home: number[]; away: number[] };
  box: { home: number[]; away: number[] };
}

export function periodOf(i: number): number {
  return i < REGULATION ? Math.floor(i / QUARTER) + 1 : 5 + Math.floor((i - REGULATION) / OT_LENGTH);
}

export function isClutch(i: number, end: number, margin: number): boolean {
  return i > 109 && margin <= Math.floor((end - i + 1) / 2) * 3;
}

/** Per-league sim constants. The FBA (and D2) use `FBA_PROFILE`; the FBAJC Java uses `JC_PROFILE`. */
export interface SimProfile {
  /** Subtracted from each rating when walking the cumulative weights. */
  handlerBase: number;
  /** Subtracted from the rating sum to get the size of the draw (5 × handlerBase for the Java's). */
  handlerTotalOffset: number;
  /** Added to the 0..99 shot roll: 1 gives the FBA's 1..100, 0 the FBAJC's 0..99. */
  rollOffset: number;
}
export const FBA_PROFILE: SimProfile = { handlerBase: 60, handlerTotalOffset: 300, rollOffset: 1 };
export const JC_PROFILE: SimProfile = { handlerBase: 40, handlerTotalOffset: 200, rollOffset: 0 };

/** Java: whoGetsBall = (int)(random * (Σratings − 300)) + 1, then the first cumulative (rating − 60) ≥ whoGetsBall. */
export function pickHandler(team: SimTeam, rng: Rng, profile: SimProfile = FBA_PROFILE): number {
  const total = team.players.reduce((s, p) => s + p.rating, 0) - profile.handlerTotalOffset;
  if (total <= 0) return Math.floor(rng() * team.players.length);
  const who = Math.floor(rng() * total) + 1;
  let running = 0;
  for (let k = 0; k < team.players.length; k++) {
    running += team.players[k].rating - profile.handlerBase;
    if (running >= who) return k;
  }
  return 0;
}

/** Java Team.pickDefender weights. */
export function defenderWeights(defense: SimTeam, target: SimPlayer, pos: number): number[] {
  return defense.players.map((d, i) => {
    let w = 1;
    const posDiff = Math.abs(i - pos);
    if (posDiff === 0) w *= 8;
    else if (posDiff === 1) w *= 4;
    else if (posDiff === 2) w *= 0.6;
    else w *= 0.2;
    if (posDiff >= 3) w *= 0.02;
    const ratingFactor = 1 / (1 + Math.abs(d.rating - target.rating) / 10);
    return w * (1 + ratingFactor);
  });
}

export function pickDefender(defense: SimTeam, offense: SimTeam, pos: number, rng: Rng): number {
  const weights = defenderWeights(defense, offense.players[pos], pos);
  const total = weights.reduce((s, w) => s + w, 0);
  const rand = rng() * total;
  let running = 0;
  for (let i = 0; i < weights.length; i++) {
    running += weights[i];
    if (rand <= running) return i;
  }
  return weights.length - 1;
}

export function makeChance(handlerRating: number, defenderRating: number): number {
  return Math.max(35, Math.min(65, handlerRating - Math.floor(0.45 * defenderRating) + 10));
}

/** roll is 1–100 (0–99 in the FBAJC); made when odds ≥ roll, and a margin of 30 or more scores 3. */
export function shotPoints(odds: number, roll: number): 0 | 2 | 3 {
  if (odds < roll) return 0;
  return odds - roll >= 30 ? 3 : 2;
}

interface Cursor { i: number; end: number; home: number; away: number; ot: number }

function playOne(home: SimTeam, away: SimTeam, c: Cursor, rng: Rng, profile: SimProfile): Possession {
  const offense: Side = c.i % 2 === 0 ? 'home' : 'away';
  const off = offense === 'home' ? home : away;
  const def = offense === 'home' ? away : home;
  const clutch = isClutch(c.i, c.end, Math.abs(c.home - c.away));
  const handler = pickHandler(off, rng, profile);
  const defender = pickDefender(def, off, handler, rng);
  const roll = Math.floor(rng() * 100) + profile.rollOffset;
  const points = shotPoints(makeChance(off.players[handler].rating, def.players[defender].rating), roll);
  if (offense === 'home') c.home += points;
  else c.away += points;
  const i = c.i;
  if (i % 10 === 9 && i >= REGULATION - 1 && c.home === c.away) {
    c.end += OT_LENGTH;
    c.ot++;
  }
  c.i++;
  return { i, period: periodOf(i), offense, handler, defender, made: points > 0, points, homeScore: c.home, awayScore: c.away, clutch, end: c.end };
}

function runOut(home: SimTeam, away: SimTeam, c: Cursor, rng: Rng, profile: SimProfile, onPossession?: (p: Possession) => void): void {
  while (c.i < c.end) {
    if (c.i >= MAX_POSSESSIONS) throw new Error('Game did not finish');
    const p = playOne(home, away, c, rng, profile);
    onPossession?.(p);
  }
}

export function simGame(gameNo: number, home: SimTeam, away: SimTeam, rng: Rng, profile: SimProfile = FBA_PROFILE): SimGame {
  if (home.players.length !== 5 || away.players.length !== 5) throw new Error('Each team needs exactly 5 players');
  const c: Cursor = { i: 0, end: REGULATION, home: 0, away: 0, ot: 0 };
  const possessions: Possession[] = [];
  const box = { home: [0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] };
  const periods = { home: [] as number[], away: [] as number[] };
  runOut(home, away, c, rng, profile, p => {
    possessions.push(p);
    box[p.offense][p.handler] += p.points;
    while (periods.home.length < p.period) {
      periods.home.push(0);
      periods.away.push(0);
    }
    periods[p.offense][p.period - 1] += p.points;
  });
  return { gameNo, home, away, possessions, homePts: c.home, awayPts: c.away, ot: c.ot, periods, box, profile };
}

/** Chance the home team wins, simulating the rest of the game n times from the state after `revealed` possessions. */
export function winProbability(game: SimGame, revealed: number, rng: Rng, n = 200): number {
  if (revealed >= game.possessions.length) return game.homePts > game.awayPts ? 1 : 0;
  const last = revealed > 0 ? game.possessions[revealed - 1] : null;
  let wins = 0;
  for (let k = 0; k < n; k++) {
    const c: Cursor = {
      i: revealed,
      end: last ? last.end : REGULATION,
      home: last ? last.homeScore : 0,
      away: last ? last.awayScore : 0,
      ot: 0,
    };
    runOut(game.home, game.away, c, rng, FBA_PROFILE);
    if (c.home > c.away) wins++;
  }
  return wins / n;
}
