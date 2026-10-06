import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { buildRatingPause, finishRatingPause, performanceChange, playerSeasonStats, ratingInterval, setPauseRating, startRatingPause } from './ratingPause';
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
      home: s.rosters.teams[g.home].map(e => ({ playerId: e.playerId!, pts: e.playerId === 'p00001' ? 40 : 10, att: 20, offExp: 2000, offVar: 312000 })),
      away: s.rosters.teams[g.away].map(e => ({ playerId: e.playerId!, pts: e.playerId === 'p00001' ? 40 : 10, att: 20, offExp: 2000, offVar: 312000 })),
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
    expect(star.perf).toBe(1);
    expect(star.suggested).toBe(96);
    for (const r of lowMin) expect(r.suggested).toBe(Math.max(1, Math.min(99, r.oldRating + r.perf!)));
  });

  it('does not punish a player for fewer scoring opportunities when both meet their shot expectations', () => {
    const s = atFirstPause();
    for (const game of s.results!.games) for (const line of [...game.box!.home, ...game.box!.away]) {
      const star = line.playerId === 'p00001';
      line.pts = star ? 36 : 12;
      line.att = star ? 30 : 10;
      line.offExp = line.pts * 100;
      line.offVar = line.att * 15600;
    }
    const rows = buildRatingPause(s, 1);
    expect(rows.find(r => r.playerId === 'p00001')).toMatchObject({ ppg: 36, expectedPpg: 36, perf: 0, suggested: 95 });
    expect(rows.find(r => r.playerId === 'p00002')).toMatchObject({ ppg: 12, expectedPpg: 12, perf: 0, suggested: 88 });
  });

  it('distinguishes identical scoring against harder versus easier defenders', () => {
    const s = atFirstPause();
    s.rosters.teams.BOS[2].rating = 88;
    for (const game of s.results!.games) for (const line of [...game.box!.home, ...game.box!.away]) {
      if (line.playerId === 'p00002') Object.assign(line, { pts: 24, att: 20, offExp: 2000, offVar: 312000 });
      if (line.playerId === 'p00003') Object.assign(line, { pts: 24, att: 20, offExp: 2800, offVar: 312000 });
    }
    const rows = buildRatingPause(s, 1);
    expect(rows.find(r => r.playerId === 'p00002')!.perf).toBe(1);
    expect(rows.find(r => r.playerId === 'p00003')!.perf).toBe(-1);
  });

  it('judges a player on the games that carry shooting data, when he has enough of them', () => {
    const s = atFirstPause();
    delete s.results!.games[0].box!.home[0].offExp;
    expect(buildRatingPause(s, 1)[0]).toMatchObject({ games: 2, performanceGames: 1, perf: 1, suggested: 96, rating: 96, expectedPpg: 20 });
  });

  it('does not guess when too few games carry shooting data', () => {
    const s = atFirstPause();
    delete s.results!.games[0].box!.home[0].offExp;
    expect(buildRatingPause(s, 2)[0]).toMatchObject({ games: 2, performanceGames: 1, perf: null, suggested: null, rating: 95 });
  });

  it('leaves a player with no shot opportunities unchanged', () => {
    const s = atFirstPause();
    for (const g of s.results!.games) for (const line of [...g.box!.home, ...g.box!.away]) {
      if (line.playerId === 'p00001') Object.assign(line, { pts: 0, att: 0, offExp: 0, offVar: 0 });
    }
    expect(buildRatingPause(s, 1)[0]).toMatchObject({ perf: null, suggested: null, rating: 95 });
  });

  it('counts only the fresh block and excludes old hot games from later pauses', () => {
    const s = atFirstPause();
    s.schedule!.pauses[0].done = true;
    const later = structuredClone(s.results!.games).map(g => ({ ...g, gameNo: g.gameNo + 4 }));
    for (const g of later) for (const line of [...g.box!.home, ...g.box!.away]) {
      line.pts = 20;
      line.offExp = 2000;
    }
    s.results!.games.push(...later);
    expect(ratingInterval(s)).toMatchObject({ afterGame: 4, throughGame: 8 });
    expect(buildRatingPause(s, 1)[0]).toMatchObject({ games: 2, ppg: 20, perf: 0, suggested: 95 });
    expect(playerSeasonStats(s.results).get('p00001')).toEqual({ games: 4, pts: 120 });
  });

  it('never includes games beyond the due pause or excludes the first game in the new block', () => {
    const s = atFirstPause();
    s.results!.games.push({ ...s.results!.games[0], gameNo: 5 });
    expect(ratingInterval(s).results!.games.map(g => g.gameNo)).toEqual([1, 2, 3, 4]);
  });
});

describe('rating ceiling', () => {
  it.each([
    [89, 0.5, 1], [89, 1.5, 2], [90, 0.5, 0], [94, 1.49, 0],
    [90, 1.5, 1], [94, 5, 1], [95, 1.99, 0], [95, 2, 1],
    [98, 10, 1], [99, 10, 0], [99, -0.5, 0], [95, -1.5, 0],
    [90, -1.49, 0], [90, -1.5, -1], [94, -5, -1],
    [95, -1.99, 0], [95, -2, -1], [98, -10, -1], [99, -2, -1],
    [89, -0.5, -1], [89, -1.5, -2],
  ])('rating %s and evidence %s produce a change of %s', (rating, z, change) => {
    expect(performanceChange(rating, z)).toBe(change);
  });

  it.each([90, 94, 95, 98])('treats equal positive and negative evidence symmetrically at rating %s', rating => {
    for (const evidence of [0, 0.5, 1.49, 1.5, 1.99, 2, 3, 10]) {
      expect(performanceChange(rating, evidence) + performanceChange(rating, -evidence)).toBe(0);
    }
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
