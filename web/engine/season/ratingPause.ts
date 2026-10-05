import { appendTx, type MoveContext } from '../roster/state';
import type { RatingPauseFile, RatingPauseRow, ResultsFile } from '../shared/types';
import { completePause } from './moves';
import { blockingPause, playerName, seasonFail, type SeasonResult, type SeasonState } from './state';

export const MIN_PAUSE_GAMES = 5;

export function playerSeasonStats(results: ResultsFile | null): Map<string, { games: number; pts: number }> {
  const out = new Map<string, { games: number; pts: number }>();
  for (const g of results?.games ?? []) {
    for (const line of [...(g.box?.home ?? []), ...(g.box?.away ?? [])]) {
      const s = out.get(line.playerId) ?? { games: 0, pts: 0 };
      s.games++;
      s.pts += line.pts;
      out.set(line.playerId, s);
    }
  }
  return out;
}

const clampRating = (n: number) => Math.max(1, Math.min(99, n));

/** Only games since the preceding completed rating pause, up to the current pause. */
export function ratingInterval(state: SeasonState): { afterGame: number; throughGame: number; results: ResultsFile | null } {
  const due = blockingPause(state);
  const throughGame = due?.kind === 'ratings' ? due.afterGame
    : Math.max(0, ...(state.results?.games ?? []).map(g => g.gameNo));
  const afterGame = Math.max(0, ...(state.schedule?.pauses ?? [])
    .filter(p => p.kind === 'ratings' && p.done && p.afterGame < throughGame).map(p => p.afterGame));
  return { afterGame, throughGame, results: state.results ? { ...state.results, games: state.results.games.filter(g => g.gameNo > afterGame && g.gameNo <= throughGame) } : null };
}

/** Elite ratings need equally strong evidence in either direction, with changes capped at one point. */
export function performanceChange(rating: number, z: number): number {
  if (rating >= 90) {
    const threshold = rating >= 95 ? 2 : 1.5;
    if (z <= -threshold) return -1;
    return z >= threshold && rating < 99 ? 1 : 0;
  }
  if (z <= -1.5) return -2;
  if (z <= -0.5) return -1;
  return z >= 1.5 ? 2 : z >= 0.5 ? 1 : 0;
}

/** One row per rated FBA roster player (team order, then slot order). */
export function buildRatingPause(state: SeasonState, minGames = MIN_PAUSE_GAMES): RatingPauseRow[] {
  const interval = ratingInterval(state);
  const stats = playerSeasonStats(interval.results);
  const shooting = new Map<string, { games: number; attempts: number; pts: number; exp: number; variance: number }>();
  for (const g of interval.results?.games ?? []) {
    for (const line of [...(g.box?.home ?? []), ...(g.box?.away ?? [])]) {
      if (line.att === undefined || line.offExp === undefined || line.offVar === undefined) continue;
      const t = shooting.get(line.playerId) ?? { games: 0, attempts: 0, pts: 0, exp: 0, variance: 0 };
      t.games++;
      t.attempts += line.att;
      t.pts += line.pts;
      t.exp += line.offExp;
      t.variance += line.offVar;
      shooting.set(line.playerId, t);
    }
  }
  const base = Object.entries(state.rosters.teams).flatMap(([teamId, entries]) =>
    entries.filter(e => e.playerId !== null && e.rating !== null).map(e => {
      const s = stats.get(e.playerId!) ?? { games: 0, pts: 0 };
      return { playerId: e.playerId!, teamId, position: e.position, oldRating: e.rating!, games: s.games, ppgExact: s.games ? s.pts / s.games : 0 };
    }));
  return base.map(r => {
    const shots = shooting.get(r.playerId);
    const complete = shots !== undefined && shots.games === r.games;
    const z = shots && complete && shots.games >= minGames && shots.attempts > 0 && shots.variance > 0
      ? (shots.pts - shots.exp / 100) / Math.sqrt(shots.variance / 10000) : null;
    const p = z === null ? null : performanceChange(r.oldRating, z);
    const suggested = p === null ? null : clampRating(r.oldRating + p);
    return {
      playerId: r.playerId,
      teamId: r.teamId,
      position: r.position,
      oldRating: r.oldRating,
      games: r.games,
      ppg: Math.round(r.ppgExact * 10) / 10,
      performanceGames: shots?.games ?? 0,
      attempts: shots?.attempts ?? 0,
      expectedPpg: shots && complete && shots.games > 0 ? Math.round(shots.exp / 100 / shots.games * 10) / 10 : null,
      performanceZ: z,
      perf: p,
      suggested,
      rating: suggested ?? clampRating(r.oldRating),
    };
  });
}

export function startRatingPause(state: SeasonState): SeasonResult {
  const p = blockingPause(state);
  if (state.league !== 'fba' || !p || p.kind !== 'ratings') return seasonFail(['No rating adjustment is due']);
  if (state.ratingPause && state.ratingPause.afterGame === p.afterGame) return seasonFail(['Rating adjustments have already started']);
  const ratingPause: RatingPauseFile = { league: 'fba', season: state.season, afterGame: p.afterGame, locked: false, players: buildRatingPause(state) };
  return { ok: true, state: { ...state, ratingPause }, changed: ['ratingPause'], label: `Start rating adjustments (after game ${p.afterGame})` };
}

export function setPauseRating(doc: RatingPauseFile, playerId: string, value: number): RatingPauseFile {
  return { ...doc, players: doc.players.map(r => (r.playerId === playerId ? { ...r, rating: value } : r)) };
}

export function finishRatingPause(state: SeasonState, ctx: MoveContext): SeasonResult {
  const p = blockingPause(state);
  if (!p || p.kind !== 'ratings' || !state.schedule) return seasonFail(['No rating adjustment is due']);
  const doc = state.ratingPause;
  if (!doc || doc.afterGame !== p.afterGame || doc.locked) return seasonFail(['Start the rating adjustments first']);
  const changes = doc.players.filter(r => r.rating !== r.oldRating);
  const next = new Map(changes.map(r => [r.playerId, r.rating]));
  const teams = Object.fromEntries(Object.entries(state.rosters.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId && next.has(e.playerId) ? { ...e, rating: next.get(e.playerId)! } : e)),
  ]));
  let tx = state.tx;
  for (const r of changes) {
    tx = appendTx(tx, ctx, 'edit', [r.teamId], [`Rating ${r.position}-${playerName(state, r.playerId)}: ${r.oldRating}→${r.rating} (in-season)`]);
  }
  return {
    ok: true,
    state: {
      ...state,
      rosters: { ...state.rosters, teams },
      tx,
      schedule: completePause(state.schedule, 'ratings')!,
      ratingPause: { ...doc, locked: true },
    },
    changed: ['rosters', 'tx', 'schedule', 'ratingPause'],
    label: `Finish rating adjustments (after game ${p.afterGame})`,
  };
}
