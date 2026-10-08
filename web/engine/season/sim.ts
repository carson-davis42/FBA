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
  /** Games where a side changes its five between periods: `home`/`away` hold more than five players, and these are the roster indexes on the floor each quarter. */
  rotation?: Rotation;
}

/** Roster indexes on the floor for each quarter of each side (a side with one entry keeps it all game); overtime uses the first. */
export interface Rotation { home: number[][]; away: number[][] }

const lineupFor = (rotation: Rotation, side: Side, period: number): number[] => {
  const q = rotation[side];
  return q[period <= 4 ? Math.min(period - 1, q.length - 1) : 0];
};
const onFloor = (team: SimTeam, idx: number[]): SimTeam => ({ teamId: team.teamId, players: idx.map(i => team.players[i]) });

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
  /** Make-chance points lost per percentage point of touch share above an even share, so a star who takes the ball more shoots a little worse. */
  usagePenalty: number;
}
export const FBA_PROFILE: SimProfile = { handlerBase: 60, handlerTotalOffset: 300, rollOffset: 1, usagePenalty: 0.1 };
export const JC_PROFILE: SimProfile = { handlerBase: 40, handlerTotalOffset: 200, rollOffset: 0, usagePenalty: 0 };

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

/** A player's share of his team's touches: the same rating-over-base weights `pickHandler` draws from (an even share when nobody is above the base). */
export function touchShare(team: SimTeam, index: number, profile: SimProfile = FBA_PROFILE): number {
  const weights = team.players.map(p => Math.max(0, p.rating - profile.handlerBase));
  const total = weights.reduce((s, w) => s + w, 0);
  return total > 0 ? weights[index] / total : 1 / team.players.length;
}

/** Make-chance points a shooter loses for taking more than an even share of his team's touches. */
export function usagePenalty(share: number, profile: SimProfile = FBA_PROFILE): number {
  return profile.usagePenalty * Math.max(0, share - 0.2) * 100;
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

/**
 * The make chance the sim uses for one shot: the matchup odds less the shooter's usage penalty, in whole points (the roll is a whole number, so the fraction never changes a result).
 * The rating pause's expected points call this too, so expectations always match the sim.
 */
export function shotOdds(offense: SimTeam, handler: number, defense: SimTeam, defender: number, profile: SimProfile = FBA_PROFILE): number {
  return shotOddsAgainst(offense, handler, defense.players[defender].rating, profile);
}

/** `shotOdds` against a defender of a given rating (the reference defender behind points saved). */
export function shotOddsAgainst(offense: SimTeam, handler: number, defenderRating: number, profile: SimProfile = FBA_PROFILE): number {
  return Math.floor(makeChance(offense.players[handler].rating, defenderRating) - usagePenalty(touchShare(offense, handler, profile), profile));
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
  const points = shotPoints(shotOdds(off, handler, def, defender, profile), roll);
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

function runOut(home: SimTeam, away: SimTeam, c: Cursor, rng: Rng, profile: SimProfile, onPossession?: (p: Possession) => void, rotation?: Rotation): void {
  while (c.i < c.end) {
    if (c.i >= MAX_POSSESSIONS) throw new Error('Game did not finish');
    const period = periodOf(c.i);
    const p = rotation
      ? playOne(onFloor(home, lineupFor(rotation, 'home', period)), onFloor(away, lineupFor(rotation, 'away', period)), c, rng, profile)
      : playOne(home, away, c, rng, profile);
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

/**
 * The same game as `simGame`, but each side can change its five between periods. `home` and `away` are whole rosters, and `rotation`
 * says which five (by roster index) play each quarter; overtime always uses the first. Possessions refer to roster indexes.
 */
export function simRotationGame(gameNo: number, home: SimTeam, away: SimTeam, rotation: Rotation, rng: Rng, profile: SimProfile = FBA_PROFILE): SimGame {
  for (const [side, team] of [['home', home], ['away', away]] as const) {
    for (const idx of rotation[side]) {
      if (idx.length !== 5 || new Set(idx).size !== 5 || idx.some(i => !team.players[i])) throw new Error('Each lineup needs exactly 5 players from the roster');
    }
  }
  const c: Cursor = { i: 0, end: REGULATION, home: 0, away: 0, ot: 0 };
  const possessions: Possession[] = [];
  const box = { home: home.players.map(() => 0), away: away.players.map(() => 0) };
  const periods = { home: [] as number[], away: [] as number[] };
  while (c.i < c.end) {
    if (c.i >= MAX_POSSESSIONS) throw new Error('Game did not finish');
    const period = periodOf(c.i);
    const hIdx = lineupFor(rotation, 'home', period);
    const aIdx = lineupFor(rotation, 'away', period);
    const p = playOne(onFloor(home, hIdx), onFloor(away, aIdx), c, rng, profile);
    const off = p.offense === 'home' ? hIdx : aIdx;
    const def = p.offense === 'home' ? aIdx : hIdx;
    const mapped: Possession = { ...p, handler: off[p.handler], defender: def[p.defender] };
    possessions.push(mapped);
    box[p.offense][mapped.handler] += p.points;
    while (periods.home.length < p.period) { periods.home.push(0); periods.away.push(0); }
    periods[p.offense][p.period - 1] += p.points;
  }
  return { gameNo, home, away, possessions, homePts: c.home, awayPts: c.away, ot: c.ot, periods, box, profile, rotation };
}

/** Rebuilds a played game's possessions from its plays ([offense side, handler, defender, points]), working out the clutch flag and the running end as the engine did. */
export function replayPossessions(plays: [0 | 1, number, number, 0 | 2 | 3][]): Possession[] {
  const c: Cursor = { i: 0, end: REGULATION, home: 0, away: 0, ot: 0 };
  return plays.map(([side, handler, defender, points]) => {
    const offense: Side = side === 0 ? 'home' : 'away';
    const clutch = isClutch(c.i, c.end, Math.abs(c.home - c.away));
    c[offense] += points;
    const i = c.i;
    if (i % 10 === 9 && i >= REGULATION - 1 && c.home === c.away) { c.end += OT_LENGTH; c.ot++; }
    c.i++;
    return { i, period: periodOf(i), offense, handler, defender, made: points > 0, points, homeScore: c.home, awayScore: c.away, clutch, end: c.end };
  });
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
    runOut(game.home, game.away, c, rng, game.profile ?? FBA_PROFILE, undefined, game.rotation);
    if (c.home > c.away) wins++;
  }
  return wins / n;
}
