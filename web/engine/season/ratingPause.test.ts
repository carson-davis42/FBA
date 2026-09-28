import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { buildRatingPause, finishRatingPause, playerSeasonStats, setPauseRating, startRatingPause } from './ratingPause';
import type { SeasonResult, SeasonState } from './state';
import { fbaSeasonState } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const ctx = { batchId: 'b1' };

/** Four played games (every team twice) where BOS's PG scores 40 and everyone else 10. */
function atFirstPause(): SeasonState {
  const s = fbaSeasonState();
  const pairs = [['BOS', 'CAR'], ['DEN', 'MEM'], ['BOS', 'DEN'], ['CAR', 'MEM']];
  const games: GameResult[] = pairs.map(([home, away], k) => ({ gameNo: k + 1, home, away })).map(g => ({
    gameNo: g.gameNo, home: g.home, away: g.away, homePts: 50, awayPts: 60,
    box: {
      home: s.rosters.teams[g.home].map(e => ({ playerId: e.playerId!, pts: e.playerId === 'p00001' ? 40 : 10 })),
      away: s.rosters.teams[g.away].map(e => ({ playerId: e.playerId!, pts: e.playerId === 'p00001' ? 40 : 10 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}

describe('playerSeasonStats', () => {
  it('counts games and points from box scores', () => {
    const stats = playerSeasonStats(atFirstPause().results);
    expect(stats.get('p00001')).toEqual({ games: 2, pts: 80 });
    expect(stats.get('p00002')).toEqual({ games: 2, pts: 20 });
  });
});

describe('buildRatingPause', () => {
  it('lists every FBA player with games, PPG and a suggestion only past the minimum', () => {
    const rows = buildRatingPause(atFirstPause());
    expect(rows).toHaveLength(20);
    expect(rows[0]).toMatchObject({ playerId: 'p00001', teamId: 'BOS', position: 'PG', oldRating: 95, games: 2, ppg: 40, perf: null, suggested: null, rating: 95 });
    const lowMin = buildRatingPause(atFirstPause(), 1);
    const star = lowMin.find(r => r.playerId === 'p00001')!;
    expect(star.perf).toBe(2);
    expect(star.suggested).toBe(97);
    for (const r of lowMin) expect(r.suggested).toBe(Math.max(1, Math.min(99, r.oldRating + r.perf!)));
  });
});

describe('start and finish', () => {
  it('starts only when a rating pause is due, then applies edits, logs them and finishes the pause', () => {
    expect(startRatingPause(fbaSeasonState())).toEqual({ ok: false, problems: ['No rating adjustment is due'] });
    const s = atFirstPause();
    const started = ok(startRatingPause(s));
    expect(started.label).toBe('Start rating adjustments (after game 4)');
    expect(started.changed).toEqual(['ratingPause']);
    expect(startRatingPause(started.state).ok).toBe(false);
    const edited = { ...started.state, ratingPause: setPauseRating(started.state.ratingPause!, 'p00002', 91) };
    const done = ok(finishRatingPause(edited, ctx));
    expect(done.label).toBe('Finish rating adjustments (after game 4)');
    expect(done.changed).toEqual(['rosters', 'tx', 'schedule', 'ratingPause']);
    expect(done.state.rosters.teams.BOS[1].rating).toBe(91);
    expect(done.state.tx.entries.at(-1)).toMatchObject({ type: 'edit', teams: ['BOS'], lines: ['Rating SG-BOS SG: 88→91 (in-season)'] });
    expect(done.state.schedule!.pauses[0].done).toBe(true);
    expect(done.state.ratingPause!.locked).toBe(true);
  });

  it('refuses to finish before starting', () => {
    expect(finishRatingPause(atFirstPause(), ctx)).toEqual({ ok: false, problems: ['Start the rating adjustments first'] });
  });
});
