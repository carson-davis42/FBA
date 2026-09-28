import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import { zBuckets } from '../shared/perfBuckets';
import type { D2RatingRow, D2RatingsFile, RosterEntry, RostersFile } from '../shared/types';
import { randInt, type Rng } from './random';
import { d2Fail, d2Name, poolMembers, type D2Result, type D2State } from './state';

export const MIN_SUGGESTED = 40;
export const MAX_RATING = 99;

/** Ages are this season's (already advanced). Players retire after their age-32 season. */
export function ageAdjustment(age: number | null): number {
  if (age === null) return 0;
  if (age <= 22) return 3;
  if (age <= 25) return 2;
  if (age <= 29) return 0;
  if (age <= 31) return -2;
  return -3;
}

export function clampSuggested(n: number): number {
  return Math.max(MIN_SUGGESTED, Math.min(MAX_RATING, n));
}

type Scored = RosterEntry & { playerId: string; rating: number };

/**
 * −2…+2 per player from last season's D2 point totals: fit points ≈ a + b·rating over everyone
 * with points > 0, then bucket each player's residual z-score. Players without data get no entry (→ 0).
 */
export function performanceScores(prev: RostersFile | null): Map<string, number> {
  if (!prev) return new Map();
  const rows = Object.values(prev.teams).flat().filter((e): e is Scored => e.playerId !== null && e.rating !== null && e.points > 0);
  return zBuckets(rows.map(r => ({ id: r.playerId, x: r.rating, y: r.points })));
}

/** One row per pool player. Players with a D2 rating get a suggestion; everyone else starts blank. */
export function buildRatings(state: D2State, rng: Rng): D2RatingRow[] {
  const perf = performanceScores(state.prevD2);
  return poolMembers(state).map(m => {
    const base = { playerId: m.playerId, position: m.position, age: m.age, team: m.team, oldRating: m.rating };
    if (m.rating === null) return { ...base, suggested: null, breakdown: null, rating: null };
    const breakdown = { age: ageAdjustment(m.age), perf: perf.get(m.playerId) ?? 0, luck: randInt(rng, -2, 2) };
    const suggested = clampSuggested(m.rating + breakdown.age + breakdown.perf + breakdown.luck);
    return { ...base, suggested, breakdown, rating: suggested };
  });
}

export function startRatings(state: D2State, rng: Rng): D2Result {
  if (!state.freeAgencyClosed) return d2Fail(['Close free agency first']);
  if (state.ratings) return d2Fail(['The ratings reset has already started']);
  const ratings: D2RatingsFile = { league: 'fbad2', season: state.season, locked: false, players: buildRatings(state, rng) };
  return { ok: true, state: { ...state, ratings }, changed: ['ratings'], label: 'Start D2 ratings reset' };
}

/** Parses a typed rating: blank → null, otherwise a whole number from 1 to 99. */
export function parseRatingInput(text: string): { ok: true; value: number | null } | { ok: false; problem: string } {
  const t = text.trim();
  if (t === '') return { ok: true, value: null };
  if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > MAX_RATING) return { ok: false, problem: 'Enter a whole number from 1 to 99' };
  return { ok: true, value: Number(t) };
}

export function setRating(ratings: D2RatingsFile, playerId: string, value: number | null): D2RatingsFile {
  return { ...ratings, players: ratings.players.map(r => (r.playerId === playerId ? { ...r, rating: value } : r)) };
}

export function ratingsBlockers(state: D2State): string[] {
  if (!state.ratings) return ['Start the ratings reset first'];
  if (state.ratings.locked) return ['D2 ratings are already finished'];
  const out: string[] = [];
  const blanks = state.ratings.players.filter(r => r.rating === null).length;
  if (blanks) out.push(`${blanks} ${blanks === 1 ? 'player still needs' : 'players still need'} a rating`);
  const listed = new Set(state.ratings.players.map(r => r.playerId));
  const members = poolMembers(state);
  const present = new Set(members.map(m => m.playerId));
  for (const m of members) if (!listed.has(m.playerId)) out.push(`${d2Name(state, m.playerId)} isn't in the ratings list`);
  for (const r of state.ratings.players) if (!present.has(r.playerId)) out.push(`${d2Name(state, r.playerId)} is no longer in the D2 pool`);
  return out;
}

export function finishRatings(state: D2State, ctx: MoveContext): D2Result {
  const blockers = ratingsBlockers(state);
  if (blockers.length) return d2Fail(blockers);
  const ratings = state.ratings!;
  const next = new Map(ratings.players.map(r => [r.playerId, r.rating!]));
  const teams = Object.fromEntries(Object.entries(state.d2.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId !== null && next.has(e.playerId) ? { ...e, rating: next.get(e.playerId)! } : e)),
  ]));
  const reserves = { ...state.reserves, players: state.reserves.players.map(p => ({ ...p, rating: next.get(p.playerId) ?? p.rating })) };
  const edited = ratings.players.filter(r => r.suggested !== null && r.rating !== r.suggested).length;
  const d2Tx = appendTx(state.d2Tx, ctx, 'd2-ratings', [], [`D2 ratings reset: ${ratings.players.length} players, ${edited} edited`]);
  return {
    ok: true,
    state: {
      ...state,
      d2: { ...state.d2, teams },
      reserves,
      ratings: { ...ratings, locked: true },
      d2Tx,
      calendar: markStepDone(state.calendar, 'fbad2-ratings-reset'),
    },
    changed: ['d2', 'reserves', 'ratings', 'd2Tx', 'calendar'],
    label: 'Finish D2 ratings',
  };
}
