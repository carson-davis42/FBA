import { appendTx, type MoveContext } from '../roster/state';
import { zBuckets } from '../shared/perfBuckets';
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

/** One row per rated FBA roster player (team order, then slot order). */
export function buildRatingPause(state: SeasonState, minGames = MIN_PAUSE_GAMES): RatingPauseRow[] {
  const stats = playerSeasonStats(state.results);
  const base = Object.entries(state.rosters.teams).flatMap(([teamId, entries]) =>
    entries.filter(e => e.playerId !== null && e.rating !== null).map(e => {
      const s = stats.get(e.playerId!) ?? { games: 0, pts: 0 };
      return { playerId: e.playerId!, teamId, position: e.position, oldRating: e.rating!, games: s.games, ppgExact: s.games ? s.pts / s.games : 0 };
    }));
  const eligible = base.filter(r => r.games >= minGames);
  const perf = zBuckets(eligible.map(r => ({ id: r.playerId, x: r.oldRating, y: r.ppgExact })));
  return base.map(r => {
    const p = r.games >= minGames ? perf.get(r.playerId) ?? 0 : null;
    const suggested = p === null ? null : clampRating(r.oldRating + p);
    return {
      playerId: r.playerId,
      teamId: r.teamId,
      position: r.position,
      oldRating: r.oldRating,
      games: r.games,
      ppg: Math.round(r.ppgExact * 10) / 10,
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
