import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { GameResult, RosterEntry } from '../shared/types';
import { blendRankings, dropped, footballRank, frWeight, rankChanges, teamRating } from './rankings';

const g = (gameNo: number, home: string, away: string, homePts: number, awayPts: number): GameResult => ({ gameNo, home, away, homePts, awayPts });
const entry = (rating: number | null): RosterEntry => ({ playerId: 'p', position: 'PG', rating, age: 20, points: 0 });

describe('teamRating', () => {
  it('averages the five starters, null as 0', () => {
    expect(teamRating([entry(80), entry(70), entry(60), entry(50), entry(null), entry(99)])).toBe(52);
  });
});

describe('frWeight', () => {
  it('is 0 at 5%, 1 at 65%, smoothstep between', () => {
    expect(frWeight(0)).toBe(0);
    expect(frWeight(0.05)).toBe(0);
    expect(frWeight(0.65)).toBe(1);
    expect(frWeight(0.9)).toBe(1);
    expect(frWeight(0.35)).toBeCloseTo(0.5, 10);
  });
});

describe('footballRank', () => {
  it('puts the head of a chain first', () => {
    expect(footballRank(['C', 'B', 'A'], [g(1, 'A', 'B', 80, 70), g(2, 'B', 'C', 80, 70)])).toEqual(['A', 'B', 'C']);
  });
  it('ignores ties and appends unconnected teams', () => {
    expect(footballRank(['X', 'A', 'B'], [g(1, 'A', 'B', 80, 80)])).toEqual(['X', 'A', 'B']);
  });
});

describe('blendRankings', () => {
  const teams = ['A', 'B', 'C', 'D'];
  const ratings = { A: 90, B: 80, C: 70, D: 60 };
  it('orders by team rating with zero games', () => {
    expect(blendRankings({ teams, ratings, games: [], totalGames: 3132 }, mulberry32(1))).toEqual(['A', 'B', 'C', 'D']);
  });
  it('shuffles rating ties deterministically', () => {
    const r = { A: 50, B: 50, C: 50, D: 50 };
    const a = blendRankings({ teams, ratings: r, games: [], totalGames: 3132 }, mulberry32(3));
    const b = blendRankings({ teams, ratings: r, games: [], totalGames: 3132 }, mulberry32(3));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(teams);
  });
  it('drops a top-rated team that lost to everyone once the ranker dominates', () => {
    // A (rated best) loses to all; D (rated worst) beats all.
    const games: GameResult[] = [];
    let n = 1;
    for (let k = 0; k < 800; k++) {
      games.push(g(n++, 'B', 'A', 90, 60), g(n++, 'C', 'A', 90, 60), g(n++, 'D', 'A', 90, 60));
      games.push(g(n++, 'D', 'B', 90, 60), g(n++, 'D', 'C', 90, 60), g(n++, 'B', 'C', 80, 70));
    }
    const out = blendRankings({ teams, ratings, games, totalGames: 3132 }, mulberry32(1));
    expect(out[0]).toBe('D');
    expect(out[3]).toBe('A');
  });
});

describe('rankChanges and dropped', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `T${i}`);
  const prev = ids;
  const cur = ['T1', 'T0', 'T2', ...ids.slice(4, 25), 'T3', 'T25'].slice(0, 25);
  it('labels moves', () => {
    const r = rankChanges(prev, cur);
    expect(r).toHaveLength(25);
    expect(r[0]).toEqual({ teamId: 'T1', rank: 1, change: '+1' });
    expect(r[1]).toEqual({ teamId: 'T0', rank: 2, change: '-1' });
    expect(r[2]).toEqual({ teamId: 'T2', rank: 3, change: '--' });
  });
  it('marks newcomers NR and handles no previous poll', () => {
    expect(rankChanges(prev, ['T29', ...ids.slice(0, 24)])[0].change).toBe('NR');
    expect(rankChanges(null, ids)[0].change).toBe('NR');
  });
  it('lists teams that left the top 25', () => {
    expect(dropped(prev, ['T25', ...ids.slice(1, 25)])).toEqual(['T0']);
    expect(dropped(null, cur)).toEqual([]);
  });
});
