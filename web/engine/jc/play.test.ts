import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { RosterEntry } from '../shared/types';
import { playDay, playToEnd, progressRatings, regularSeasonOver } from './play';
import { jcStateFixture } from './testFixtures';

const entry = (rating: number, id = 'p00001'): RosterEntry => ({ playerId: id, position: 'PG', rating, age: null, points: 0 });

describe('progressRatings', () => {
  it('never exceeds 99 or lowers a rating, and 99 stays 99', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const r = 40 + (i % 60);
      const out = progressRatings([entry(r)], { p00001: 30 }, i % 2 === 0, 70, 65, rng)[0].rating!;
      expect(out).toBeGreaterThanOrEqual(r);
      expect(out).toBeLessThanOrEqual(99);
    }
    expect(progressRatings([entry(99)], { p00001: 40 }, true, 90, 60, rng)[0].rating).toBe(99);
  });
  it('gains less after a loss', () => {
    const rng = mulberry32(11);
    let win = 0;
    let loss = 0;
    for (let i = 0; i < 2000; i++) {
      win += progressRatings([entry(70)], { p00001: 10 }, true, 65, 65, rng)[0].rating! - 70;
      loss += progressRatings([entry(70)], { p00001: 10 }, false, 65, 65, rng)[0].rating! - 70;
    }
    expect(win / 2000).toBeGreaterThan(loss / 2000);
  });
});

describe('playDay', () => {
  it('plays day 1: 108 results, points added, a ranking snapshot, day 2 filled', () => {
    const s0 = jcStateFixture();
    const r = playDay(s0, mulberry32(7));
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.results!.games).toHaveLength(108);
    expect(r.changed).toEqual(['results', 'rosters', 'rankings']);
    expect(r.state.rankings!.snapshots).toHaveLength(1);
    expect(r.state.rankings!.snapshots[0].afterDay).toBe(1);
    expect(new Set(r.state.rankings!.snapshots[0].order).size).toBe(216);
    for (const g of r.state.results!.games) {
      g.box!.home.forEach((b) => {
        const before = s0.rosters.teams[g.home].find(e => e.playerId === b.playerId)!;
        const after = r.state.rosters.teams[g.home].find(e => e.playerId === b.playerId)!;
        expect(after.points).toBe(before.points + b.pts);
      });
    }
    const r2 = playDay(r.state, mulberry32(8));
    if (!r2.ok) throw new Error(r2.problems.join());
    expect(r2.changed).toContain('schedule');
    expect(r2.state.schedule!.days.find(d => d.day === 2)!.games).toHaveLength(108);
    expect(r2.state.results!.games[108].gameNo).toBe(109);
  });
  it('creates the rankings doc when missing', () => {
    const r = playDay({ ...jcStateFixture(), rankings: null }, mulberry32(1));
    expect(r.ok && r.state.rankings!.snapshots).toHaveLength(1);
  });
  it('refuses when the step is not current', () => {
    const s = jcStateFixture();
    s.calendar = { ...s.calendar, steps: s.calendar.steps.map(x => ({ ...x, done: true })) };
    expect(playDay(s, mulberry32(1)).ok).toBe(false);
  });
});

describe('playToEnd', () => {
  const s0 = jcStateFixture();
  const r = playToEnd(s0, mulberry32(7));
  if (!r.ok) throw new Error(r.problems.join());
  it('plays all 3132 games, 29 snapshots, no team twice a day', () => {
    expect(r.state.results!.games).toHaveLength(3132);
    expect(r.state.rankings!.snapshots).toHaveLength(29);
    expect(regularSeasonOver(r.state)).toBe(true);
    expect(r.label).toBe('Play to end of regular season');
    const games = r.state.results!.games;
    for (let d = 0; d < 29; d++) {
      const day = games.slice(d * 108, d * 108 + 108).flatMap(g => [g.home, g.away]);
      expect(new Set(day).size).toBe(216);
    }
  });
  it('is deterministic for a seed', () => {
    const again = playToEnd(jcStateFixture(), mulberry32(7));
    expect(again.ok && again.state.results).toEqual(r.state.results);
  });
  it('refuses once the season is over', () => {
    expect(playToEnd(r.state, mulberry32(1)).ok).toBe(false);
    expect(playDay(r.state, mulberry32(1)).ok).toBe(false);
  });
});
