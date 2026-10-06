import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { allTimeStreaks, currentStreaks, seasonSpan, trackStreaks, type StreakRecord } from './streaks';

let n = 0;
/** A game that `win` wins over `lose`, numbered in order. */
const game = (win: string, lose: string): GameResult => ({ gameNo: ++n, home: win, away: lose, homePts: 80, awayPts: 70 });
const season = (s: number, regular: GameResult[], playoffs: GameResult[] = []) => ({ season: s, regular, playoffs });

describe('trackStreaks', () => {
  it('follows each team through wins and losses', () => {
    const runs = trackStreaks([season(79, [game('A', 'B'), game('A', 'B'), game('A', 'C'), game('B', 'A'), game('B', 'C')])]);
    const of = (team: string) => runs.filter(r => r.teamId === team).map(r => `${r.kind}${r.length}${r.active ? '*' : ''}`);
    expect(of('A')).toEqual(['W3', 'L1*']);
    expect(of('B')).toEqual(['L2', 'W2*']);
    expect(of('C')).toEqual(['L2*']);
  });

  it('carries a streak from the regular season into the playoffs and across seasons', () => {
    const runs = trackStreaks([
      season(79, [game('A', 'B'), game('A', 'B')], [game('A', 'B'), game('A', 'B')]),
      season(80, [game('A', 'C'), game('A', 'C')]),
    ]);
    const a = runs.filter(r => r.teamId === 'A');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'W', length: 6, fromSeason: 79, toSeason: 80, playoffGames: 2, active: true });
  });

  it('starts a new run when the result flips, and keeps the closed run as it was', () => {
    const runs = trackStreaks([season(79, [game('A', 'B'), game('A', 'B'), game('B', 'A')])]);
    const a = runs.filter(r => r.teamId === 'A');
    expect(a.map(r => [r.kind, r.length, r.active])).toEqual([['W', 2, false], ['L', 1, true]]);
  });

  it('orders games by game number within a season, whatever order they arrive in', () => {
    const g1 = game('A', 'B'), g2 = game('A', 'B'), g3 = game('B', 'A');
    const runs = trackStreaks([season(79, [g3, g1, g2])]);
    expect(runs.filter(r => r.teamId === 'A').map(r => `${r.kind}${r.length}`)).toEqual(['W2', 'L1']);
  });
});

describe('currentStreaks', () => {
  it('lists the active run of each team, longest first', () => {
    const runs = trackStreaks([season(79, [game('A', 'B'), game('A', 'B'), game('A', 'C'), game('B', 'C')])]);
    expect(currentStreaks(runs).map(r => `${r.teamId}:${r.kind}${r.length}`)).toEqual(['A:W3', 'C:L2', 'B:W1']);
  });
});

describe('allTimeStreaks', () => {
  const records: StreakRecord[] = [
    { teamId: 'CGG', name: 'Cypress Green Guns', kind: 'W', length: 50, fromSeason: 33, toSeason: 38 },
    { teamId: 'OAK', name: 'Oakland All-Stars', kind: 'W', length: 35, fromSeason: 26, toSeason: 29 },
    { teamId: 'SAS', name: 'San Antonio', kind: 'L', length: 21, fromSeason: 50, toSeason: 53 },
  ];
  const tracked = trackStreaks([season(79, Array.from({ length: 40 }, () => game('BOS', 'X')))]);

  it('mixes recorded and tracked streaks, longest first, per kind', () => {
    const wins = allTimeStreaks(records, tracked, 'W', 20);
    expect(wins.map(r => `${r.teamId}:${r.length}:${r.source}`)).toEqual(['CGG:50:record', 'BOS:40:tracked', 'OAK:35:record']);
    expect(allTimeStreaks(records, tracked, 'L', 20).map(r => `${r.teamId}:${r.length}`)).toEqual(['X:40', 'SAS:21']);
  });

  it('ranks ties equally and keeps a tie at the cut-off', () => {
    const tie: StreakRecord[] = ['A', 'B', 'C'].map(teamId => ({ teamId, name: teamId, kind: 'W', length: 20, fromSeason: 10, toSeason: 11 }));
    const list = allTimeStreaks(tie, [], 'W', 2);
    expect(list).toHaveLength(3);
    expect(list.map(r => r.rank)).toEqual([1, 1, 1]);
  });

  it('flags a tracked streak that is still running', () => {
    expect(allTimeStreaks([], tracked, 'W', 5)[0].active).toBe(true);
  });
});

describe('seasonSpan', () => {
  it('writes one season or a range', () => {
    expect(seasonSpan(79, 79)).toBe('S79');
    expect(seasonSpan(33, 38)).toBe('S33–S38');
  });
});
