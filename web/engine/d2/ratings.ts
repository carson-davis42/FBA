import { rankingBlockers, reserveBound, suggestionsTaken } from '../rank/ranking';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import type { RankingFile, RankingRow, RostersFile } from '../shared/types';
import { POOL_CUTOFF } from './pool';
import { d2Fail, d2Name, poolMembers, type D2Result, type D2State } from './state';

export const MAX_RATING = 99;

/** Parses a typed rating: blank → null, otherwise a whole number from 1 to 99. */
export function parseRatingInput(text: string): { ok: true; value: number | null } | { ok: false; problem: string } {
  const t = text.trim();
  if (t === '') return { ok: true, value: null };
  if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > MAX_RATING) return { ok: false, problem: 'Enter a whole number from 1 to 99' };
  return { ok: true, value: Number(t) };
}

/** One ranking row per D2 pool member (rosters in team order, then Reserves). */
export function buildRankingRows(state: D2State): RankingRow[] {
  const points = new Map<string, number>();
  for (const e of Object.values(state.prevD2?.teams ?? {}).flat()) {
    if (e.playerId) points.set(e.playerId, (points.get(e.playerId) ?? 0) + e.points);
  }
  const fbaRating = new Map(state.reserves.players.flatMap(p => (p.fbaRating === undefined ? [] : [[p.playerId, p.fbaRating] as const])));
  const inPool = new Set(state.reserves.players.filter(p => !p.fromFba).map(p => p.playerId));
  return poolMembers(state).map(m => ({
    playerId: m.playerId,
    position: m.position,
    age: m.age,
    team: m.team,
    prevRating: m.rating,
    ...(m.team === null && inPool.has(m.playerId) ? { inLeague: true } : {}),
    otherRating: fbaRating.get(m.playerId) ?? null,
    stat: points.has(m.playerId) ? `${points.get(m.playerId)} pts` : null,
  }));
}

/** The suggestion ladder, high to low: last season's finished D2 reset ratings; without one, these rows' current D2 ratings. */
export function d2Curve(prevRatings: RankingFile | null, rows: RankingRow[]): number[] {
  const source = prevRatings?.locked
    ? Object.values(prevRatings.ratings)
    : rows.flatMap(r => (r.prevRating === null ? [] : [r.prevRating]));
  return source.map(v => Math.max(1, Math.min(MAX_RATING, v))).sort((a, b) => b - a);
}

/**
 * Stretches a ladder shorter than `slots` (the D2 roster spots) to that many rungs by interpolating between neighbours, so the
 * suggestions reach the last rostered rank with the same top and bottom. A ladder that is long enough is returned as is.
 */
export function stretchCurve(curve: number[], slots: number): number[] {
  if (curve.length < 2 || curve.length >= slots) return curve;
  return Array.from({ length: slots }, (_, j) => {
    const x = (j * (curve.length - 1)) / (slots - 1);
    const i = Math.floor(x);
    const hi = curve[Math.min(i + 1, curve.length - 1)];
    return Math.round(curve[i] + (hi - curve[i]) * (x - i));
  });
}

/** The D2 roster slots (teams × positions): how many ranks the suggestion ladder should reach. */
const rosterSlots = (d2: RostersFile): number => Object.values(d2.teams).reduce((n, t) => n + t.length, 0);

/** An unfinished reset saved before the ladder was stretched gets the stretch too; anything else is returned as is. */
export function stretchedRatings(d2: RostersFile, doc: RankingFile): RankingFile {
  if (doc.locked) return doc;
  const curve = stretchCurve(doc.curve, rosterSlots(d2));
  return curve === doc.curve ? doc : { ...doc, curve };
}

export function startRatings(state: D2State): D2Result {
  if (!state.freeAgencyClosed) return d2Fail(['Close free agency first']);
  if (state.ratings) return d2Fail(['The ratings reset has already started']);
  const rows = buildRankingRows(state);
  const ratings: RankingFile = {
    league: 'fbad2', season: state.season, kind: 'd2-reset', locked: false, rows, order: [], ratings: {}, curve: stretchCurve(d2Curve(state.prevRatings, rows), rosterSlots(state.d2)),
  };
  return { ok: true, state: { ...state, ratings }, changed: ['ratings'], label: 'Start D2 ratings reset' };
}

/** The ranking must list exactly the D2 pool: nobody missing, nobody who has left it. */
export function membershipBlockers(state: D2State): string[] {
  if (!state.ratings) return [];
  const listed = new Set(state.ratings.rows.map(r => r.playerId));
  const members = poolMembers(state);
  const present = new Set(members.map(m => m.playerId));
  const out: string[] = [];
  for (const m of members) if (!listed.has(m.playerId)) out.push(`${d2Name(state, m.playerId)} isn't in the ratings list`);
  for (const r of state.ratings.rows) if (!present.has(r.playerId)) out.push(`${d2Name(state, r.playerId)} is no longer in the D2 pool`);
  return out;
}

export function ratingsBlockers(state: D2State, cutoff = POOL_CUTOFF): string[] {
  if (!state.ratings) return ['Start the ratings reset first'];
  if (state.ratings.locked) return ['D2 ratings are already finished'];
  return [...rankingBlockers(state.ratings, id => d2Name(state, id), reserveBound(state.ratings, cutoff)), ...membershipBlockers(state)];
}

export function finishRatings(state: D2State, ctx: MoveContext, cutoff = POOL_CUTOFF): D2Result {
  const blockers = ratingsBlockers(state, cutoff);
  if (blockers.length) return d2Fail(blockers);
  const ratings = state.ratings!;
  // Players ranked past their position's spots go to the Reserve pool unrated.
  const reserve = reserveBound(ratings, cutoff);
  const next = new Map(Object.entries(ratings.ratings).filter(([id]) => !reserve.has(id)));
  const rated = (id: string | null, current: number | null) => (id !== null && reserve.has(id) ? null : id !== null && next.has(id) ? next.get(id)! : current);
  const teams = Object.fromEntries(Object.entries(state.d2.teams).map(([t, entries]) => [
    t, entries.map(e => ({ ...e, rating: rated(e.playerId, e.rating) })),
  ]));
  const reserves = { ...state.reserves, players: state.reserves.players.map(p => ({ ...p, rating: rated(p.playerId, p.rating) })) };
  const line = `D2 ratings reset: ${ratings.rows.length} players ranked, ${suggestionsTaken(ratings, reserve)} took the suggestion`;
  const d2Tx = appendTx(state.d2Tx, ctx, 'd2-ratings', [], [line]);
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
