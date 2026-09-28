import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { betterThan, markerFor, standings, type TeamRecord } from './standings';

const rec = (teamId: string, group: string, w: number, l: number, extra: Partial<TeamRecord> = {}): TeamRecord => ({
  teamId, group, w, l, confW: 0, confL: 0, pf: 0, pa: 0, h2h: new Map(), log: [], ...extra,
});

describe('betterThan (FBA, Java isBetterThan)', () => {
  it('uses games behind, then fewer games played', () => {
    expect(betterThan('fba', rec('A', 'E', 5, 1), rec('B', 'E', 4, 2))).toBe(true);
    const a = rec('A', 'E', 3, 1);
    const b = rec('B', 'E', 2, 0);
    expect(betterThan('fba', a, b)).toBe(false);
    expect(betterThan('fba', b, a)).toBe(true);
  });
  it('then conference wins for same-conference teams, then head-to-head', () => {
    expect(betterThan('fba', rec('A', 'E', 3, 1, { confW: 3 }), rec('B', 'E', 3, 1, { confW: 2 }))).toBe(true);
    const a = rec('A', 'E', 3, 1, { confW: 2, h2h: new Map([['B', 2]]) });
    const b = rec('B', 'E', 3, 1, { confW: 2, h2h: new Map([['A', 1]]) });
    expect(betterThan('fba', a, b)).toBe(true);
    expect(betterThan('fba', b, a)).toBe(false);
  });
  it('falls back to point differential, then team id', () => {
    expect(betterThan('fba', rec('A', 'E', 3, 1, { pf: 300, pa: 290 }), rec('B', 'W', 3, 1, { pf: 300, pa: 280 }))).toBe(false);
    expect(betterThan('fba', rec('A', 'E', 3, 1), rec('B', 'W', 3, 1))).toBe(true);
  });
});

describe('markerFor (Java clinchStar / clinchX / clinchN)', () => {
  const rows = [[10, 0], [9, 1], [8, 2], [8, 2], [7, 3], [6, 4], [6, 4], [5, 5], [2, 4], [0, 10]]
    .map(([w, l]) => ({ w, l, confW: w, confL: l }));
  it('marks the #1 seed, clinched playoff teams, and eliminated teams', () => {
    expect(rows.map((_, i) => markerFor(rows, i, { games: 10, confGames: 10 }))).toEqual(
      ['*', 'x', 'x', 'x', 'x', 'x', 'x', null, null, 'n'],
    );
  });
  it('marks nothing before anyone has played', () => {
    const fresh = Array.from({ length: 10 }, () => ({ w: 0, l: 0, confW: 0, confL: 0 }));
    expect(fresh.map((_, i) => markerFor(fresh, i, { games: 10, confGames: 10 }))).toEqual(Array(10).fill(null));
  });
});

describe('standings', () => {
  const teams = [{ teamId: 'A', group: 'E' }, { teamId: 'B', group: 'E' }, { teamId: 'C', group: 'E' }, { teamId: 'D', group: 'W' }];
  const g = (gameNo: number, home: string, homePts: number, away: string, awayPts: number): GameResult => ({ gameNo, home, away, homePts, awayPts });
  const games = [
    g(1, 'A', 80, 'B', 70), g(2, 'B', 90, 'A', 60), g(3, 'A', 70, 'C', 60),
    g(4, 'B', 70, 'C', 60), g(5, 'A', 70, 'D', 60), g(6, 'B', 75, 'D', 60),
  ];

  it('orders each group, with GB, conference record, last 10, streak and differential', () => {
    const s = standings('fba', teams, games);
    expect(s.groups.map(x => x.group)).toEqual(['E', 'W']);
    const east = s.groups[0].rows;
    expect(east.map(r => r.teamId)).toEqual(['B', 'A', 'C']);
    expect(east.map(r => r.gb)).toEqual([0, 0, 2]);
    expect(east[0]).toMatchObject({ seed: 1, w: 3, l: 1, confW: 2, confL: 1, diff: 45, l10: '3-1', streak: 'W3' });
    expect(east[1]).toMatchObject({ w: 3, l: 1, streak: 'W2', diff: 0 });
    expect(s.groups[1].rows[0]).toMatchObject({ teamId: 'D', w: 0, l: 2, streak: 'L2', pct: 0 });
    expect(s.lottery).toEqual([]);
  });

  it('puts D2 leagues in PL, WL, UL, IL order, with markers now shown for D2 too', () => {
    const d2 = [{ teamId: 'X', group: 'WL' }, { teamId: 'Y', group: 'PL' }];
    const s = standings('fbad2', d2, [g(1, 'X', 50, 'Y', 40)]);
    expect(s.groups.map(x => x.group)).toEqual(['PL', 'WL']);
    // Each group here has a single team, trivially clinching first place.
    expect(s.groups.every(x => x.rows.every(r => r.marker === '*'))).toBe(true);
  });
});
