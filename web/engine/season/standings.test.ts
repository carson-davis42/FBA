import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { betterThan, markerFor, seasonLength, standings, type TeamRecord } from './standings';

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
    // The two 6-4 teams can still be tied by the 2-4 team (6-4 with 6 conference wins), a tie the later tiebreakers decide: open, not clinched.
    expect(rows.map((_, i) => markerFor(rows, i, { games: 10, confGames: 10 }))).toEqual(
      ['*', 'x', 'x', 'x', 'x', null, null, null, null, 'n'],
    );
  });
  it('marks nothing before anyone has played', () => {
    const fresh = Array.from({ length: 10 }, () => ({ w: 0, l: 0, confW: 0, confL: 0 }));
    expect(fresh.map((_, i) => markerFor(fresh, i, { games: 10, confGames: 10 }))).toEqual(Array(10).fill(null));
  });
});

describe('markerFor on ties that games can still decide', () => {
  const len = { games: 10, confGames: 10 };
  const top = (n: number, w = 8, l = 2, confW = 5, confL = 5) => Array.from({ length: n }, () => ({ w, l, confW, confL }));
  const markers = (rows: { w: number; l: number; confW: number; confL: number }[]) => rows.map((_, i) => markerFor(rows, i, len));

  it('does not clinch or eliminate while a team can still tie on wins and conference wins with games left', () => {
    // Eight teams finished 8-2 / 5-5; the ninth is 6-2 / 3-5 with two conference games left, so it can finish 8-2 / 5-5 too.
    const rows = [...top(8), { w: 6, l: 2, confW: 3, confL: 5 }];
    expect(markers(rows)).toEqual(Array(9).fill(null));
  });
  it('still clinches when the chaser can reach the same wins but cannot reach the same conference wins', () => {
    const rows = [...top(8), { w: 6, l: 2, confW: 2, confL: 6 }];
    expect(markers(rows).slice(0, 8)).toEqual(['*', 'x', 'x', 'x', 'x', 'x', 'x', 'x']);
    // it can reach 8 wins but only 4 conference wins against 5, so it can never pass them
    expect(markers(rows)[8]).toBe('n');
  });
  it('resolves by the final order once both teams have finished a full tie', () => {
    // Everyone finished 8-2 / 5-5: nine teams level, the order (the tiebreakers) already put the first eight in and the ninth out.
    const rows = top(9);
    const m = markers(rows);
    expect(m.slice(0, 8).every(x => x === 'x' || x === '*')).toBe(true);
    expect(m[8]).toBe('n');
  });
  it('eliminates a bubble team only when it cannot reach the spot even on a tie', () => {
    const rows = [...top(8), { w: 5, l: 3, confW: 2, confL: 6 }];
    // best case 7 wins, below the 8 wins already banked
    expect(markers(rows)[8]).toBe('n');
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

describe('seasonLength', () => {
  const league = (perGroup: number) => ['E', 'W'].flatMap(g => Array.from({ length: perGroup }, (_, i) => ({ teamId: `${g}${i}`, group: g })));
  it('matches the 15-per-conference season (86 games, 56 in conference)', () => {
    expect(seasonLength('fba', league(15))).toEqual({ games: 86, confGames: 56 });
  });
  it('is 92 and 60 for 16 per conference', () => {
    expect(seasonLength('fba', league(16))).toEqual({ games: 92, confGames: 60 });
  });
  it('is 30 for a 16-team D2 league', () => {
    expect(seasonLength('fbad2', Array.from({ length: 16 }, (_, i) => ({ teamId: `D${i}`, group: 'PL' })))).toEqual({ games: 30, confGames: 30 });
  });
});
