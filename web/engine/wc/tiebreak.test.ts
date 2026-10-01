import { describe, expect, it } from 'vitest';
import { rankTable } from './tiebreak';
import type { GameResult } from '../shared/types';

let n = 0;
const g = (home: string, away: string, homePts: number, awayPts: number): GameResult => ({ gameNo: ++n, home, away, homePts, awayPts });
const order = (t: { rows: { teamId: string }[] }) => t.rows.map(r => r.teamId);

describe('rankTable', () => {
  it('orders a clear winner order by wins', () => {
    const games = [g('A', 'B', 80, 70), g('A', 'C', 80, 70), g('B', 'C', 80, 70)];
    const t = rankTable(['C', 'B', 'A'], games, {});
    expect(order(t)).toEqual(['A', 'B', 'C']);
    expect(t.rows[0]).toEqual({ teamId: 'A', w: 2, l: 0, pf: 160, pa: 140 });
    expect(t.ties).toEqual([]);
  });

  it('breaks a two-way tie by head-to-head', () => {
    // A and B both 1-1; B beat A, A has the better differential
    const games = [g('B', 'A', 71, 70), g('A', 'C', 100, 50), g('D', 'B', 80, 70), g('D', 'C', 80, 70)];
    const t = rankTable(['A', 'B', 'C', 'D'], games, {});
    expect(order(t)).toEqual(['D', 'B', 'A', 'C']);
    expect(t.ties.some(x => x.includes('B over A') && x.includes('head-to-head 1–0'))).toBe(true);
  });

  it('reports the aggregate head-to-head score of a three-way run', () => {
    // A, B, C all 2-wins; every pair has played. h2h within the run: A 2, B 1, C 0.
    const games = [g('A', 'B', 80, 70), g('A', 'C', 80, 70), g('B', 'C', 80, 70), g('B', 'D', 80, 70), g('C', 'D', 80, 70), g('D', 'C', 60, 70), g('D', 'A', 80, 70)];
    const t = rankTable(['A', 'B', 'C', 'D'], games, {});
    expect(order(t).slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(t.ties.some(x => x.includes('A over B') && x.includes('head-to-head 2–1'))).toBe(true);
  });

  it('skips head-to-head in a three-way tie with an unplayed pair', () => {
    // A beat B, B beat C, C beat D; A,B,C... make a 3-run A,B,C each 1-1 with A-C unplayed
    const games = [g('A', 'B', 80, 70), g('B', 'C', 90, 60), g('C', 'D', 80, 70), g('D', 'A', 90, 60), g('D', 'B', 60, 50)];
    // wins: A1 B1 C1 D2 ; run A,B,C: A-C unplayed
    const t = rankTable(['A', 'B', 'C', 'D'], games, {});
    expect(order(t)).toEqual(['D', 'B', 'A', 'C']);
    expect(t.ties.some(x => x.includes('point differential'))).toBe(true);
    expect(t.ties.some(x => x.includes('head-to-head'))).toBe(false);
  });

  it('falls to the stored key when differential ties', () => {
    const games = [g('A', 'C', 80, 70), g('B', 'D', 80, 70)];
    const t = rankTable(['A', 'B', 'C', 'D'], games, { A: 0.9, B: 0.1 });
    expect(order(t).slice(0, 2)).toEqual(['B', 'A']);
    expect(t.ties.some(x => x.includes('B over A') && x.includes('random draw'))).toBe(true);
  });

  it('lists unplayed teams at 0-0', () => {
    const t = rankTable(['A', 'B'], [], { A: 2, B: 1 });
    expect(t.rows).toEqual([
      { teamId: 'B', w: 0, l: 0, pf: 0, pa: 0 },
      { teamId: 'A', w: 0, l: 0, pf: 0, pa: 0 },
    ]);
  });

  it('ignores games outside the team list', () => {
    const t = rankTable(['A', 'B'], [g('A', 'B', 80, 70), g('A', 'Z', 99, 1), g('Y', 'B', 99, 1)], {});
    expect(t.rows.find(r => r.teamId === 'A')).toEqual({ teamId: 'A', w: 1, l: 0, pf: 80, pa: 70 });
    expect(t.rows.find(r => r.teamId === 'B')).toEqual({ teamId: 'B', w: 0, l: 1, pf: 70, pa: 80 });
  });

  it('is deterministic', () => {
    const games = [g('A', 'C', 80, 70), g('B', 'D', 80, 70)];
    const keys = { A: 0.3, B: 0.3, C: 0.2, D: 0.1 };
    expect(rankTable(['A', 'B', 'C', 'D'], games, keys)).toEqual(rankTable(['A', 'B', 'C', 'D'], games, keys));
  });
});
