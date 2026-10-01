import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { GameResult, TeamsFile } from '../shared/types';
import { jcStandings } from './standings';

afterEach(cleanup);

const badge = { bg: '#000', fg: '#fff' };
const mk = (ids: string[], group: string) => ids.map(teamId => ({ teamId, name: teamId, abbr: teamId, group, logoFolder: null, badge }));
const teams: TeamsFile = { league: 'fbajc', teams: [...mk(['A', 'B', 'C', 'D'], 'X'), ...mk(['E', 'F'], 'Y')] };
let n = 0;
const g = (home: string, away: string, hp: number, ap: number): GameResult => ({ gameNo: ++n, home, away, homePts: hp, awayPts: ap });
const draws = { A: 0.1, B: 0.2, C: 0.3, D: 0.4, E: 0.5, F: 0.6 };
const run = (games: GameResult[], ranking: string[] | null = null) => jcStandings({ teams, games, ranking, drawKeys: draws });
const order = (t: ReturnType<typeof run>, conf = 'X') => t.find(x => x.conference === conf)!.rows.map(r => r.teamId);

describe('jcStandings', () => {
  it('counts tournament (cross-conference) and conference games separately', () => {
    const t = run([g('A', 'E', 70, 60), g('A', 'B', 70, 60), g('C', 'A', 50, 60)]);
    const a = t.find(x => x.conference === 'X')!.rows.find(r => r.teamId === 'A')!;
    expect([a.w, a.l, a.confW, a.confL, a.pf, a.pa]).toEqual([3, 0, 2, 0, 200, 170]);
    const e = t.find(x => x.conference === 'Y')!.rows.find(r => r.teamId === 'E')!;
    expect([e.w, e.l, e.confW, e.confL]).toEqual([0, 1, 0, 0]);
  });
  it('orders by conference games back', () => {
    expect(order(run([g('B', 'C', 60, 50), g('B', 'D', 60, 50), g('A', 'C', 60, 50)])).slice(0, 2)).toEqual(['B', 'A']);
  });
  it('fewer conference games played breaks equal games back', () => {
    // A 1-0, B 2-1 => both +1; A played fewer
    expect(order(run([g('A', 'C', 60, 50), g('B', 'C', 60, 50), g('B', 'D', 60, 50), g('D', 'B', 60, 50)])).slice(0, 2)).toEqual(['A', 'B']);
  });
  it('ranked beats unranked when records are level', () => {
    const t = run([g('A', 'E', 60, 50), g('B', 'E', 60, 50)], ['B', 'A']);
    expect(order(t).slice(0, 2)).toEqual(['B', 'A']);
    expect(run([], ['C']).find(x => x.conference === 'X')!.rows[0].teamId).toBe('C');
    expect(t[0].rows.find(r => r.teamId === 'B')!.rank).toBe(1);
  });
  it('head-to-head breaks a two-way tie', () => {
    // A beats B, B beats C, C beats A... make A 1-1, B 1-1 via others: A beats B, B beats D, A loses to C, C loses?? keep simple
    const t = run([g('A', 'B', 60, 50), g('B', 'C', 60, 50), g('C', 'A', 60, 50), g('D', 'A', 60, 50), g('B', 'D', 60, 50), g('D', 'C', 60, 50)]);
    // records conf: A 1-2, B 2-1, C 1-2, D 2-1 ; B vs D tied (+1), B beat D
    const o = order(t);
    expect(o.indexOf('B')).toBeLessThan(o.indexOf('D'));
  });
  it('stored draw resolves a full tie and is listed in ties', () => {
    const t = run([]);
    const x = t.find(c => c.conference === 'X')!;
    expect(x.rows.map(r => r.teamId)).toEqual(['A', 'B', 'C', 'D']);
    expect(x.ties.length).toBeGreaterThan(0);
    expect(x.ties[0]).toContain('A over B: random draw');
  });
});
