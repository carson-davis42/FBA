import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { GameResult } from '../shared/types';
import { dayGames, makeFields, tournamentChampion, tournamentTable, TOURNAMENT_NAMES } from './tournaments';

const confs: Record<string, string[]> = {};
for (let c = 0; c < 18; c++) confs[`C${c}`] = Array.from({ length: 12 }, (_, i) => `C${c}T${i}`);
const confOf = (id: string): string => id.split('T')[0];
const top25 = [...Array.from({ length: 12 }, (_, c) => `C${c}T0`), ...Array.from({ length: 12 }, (_, c) => `C${c}T1`), 'C12T0'];
const input = { confs, preseasonTop25: top25, lastChampion: 'C0T5', lastRunnerUp: 'C1T5' };

describe('makeFields', () => {
  const fields = makeFields(input, mulberry32(7));
  it('covers every team once in 27 fields of 8', () => {
    expect(fields).toHaveLength(27);
    expect(TOURNAMENT_NAMES).toHaveLength(27);
    expect(fields.every(f => f.teams.length === 8)).toBe(true);
    expect(new Set(fields.flatMap(f => f.teams)).size).toBe(216);
  });
  it('puts last champion and runner-up in #1', () => {
    expect(fields[0].teams).toContain('C0T5');
    expect(fields[0].teams).toContain('C1T5');
  });
  it('skips the runner-up from the same conference', () => {
    const f = makeFields({ ...input, lastRunnerUp: 'C0T6' }, mulberry32(7));
    expect(f[0].teams).toContain('C0T5');
    expect(f[0].teams).not.toContain('C0T6');
  });
  it('has the right top-25 counts', () => {
    const n = (i: number): number => fields[i].teams.filter(t => top25.includes(t)).length;
    expect(n(1)).toBe(4);
    expect(n(2)).toBe(3);
    expect(n(3)).toBe(3);
    expect(n(4)).toBe(3);
    expect(n(5)).toBe(2);
    expect(n(8)).toBe(2);
  });
  it('uses 8 distinct conferences in every field', () => {
    for (const f of fields) expect(new Set(f.teams.map(confOf)).size).toBe(8);
  });
  it('is deterministic per seed', () => {
    expect(makeFields(input, mulberry32(7))).toEqual(fields);
    expect(makeFields(input, mulberry32(8))).not.toEqual(fields);
  });
});

describe('dayGames', () => {
  const fields = makeFields(input, mulberry32(3));
  const rng = mulberry32(1);
  const res = (games: { gameNo: number; home: string; away: string }[]): GameResult[] =>
    games.map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 80, awayPts: 70 }) as GameResult);

  it('plays all 216 teams exactly once on day 1', () => {
    const d1 = dayGames(1, fields, [], 1, rng);
    expect(d1).toHaveLength(108);
    expect(new Set(d1.flatMap(g => [g.home, g.away])).size).toBe(216);
    expect(d1[0].gameNo).toBe(1);
  });
  it('builds days 2 and 3 from results and gives each team 3 games', () => {
    const d1 = dayGames(1, fields, [], 1, rng);
    const r1 = res(d1);
    const d2 = dayGames(2, fields, r1, 109, rng);
    expect(d2).toHaveLength(108);
    const f0 = fields[0];
    const w = d1.filter(g => g.tournament === f0.id).map(g => g.home);
    const g2 = d2.filter(g => g.tournament === f0.id);
    expect(g2[0]).toMatchObject({ home: w[0], away: w[1] });
    expect(g2[1]).toMatchObject({ home: w[2], away: w[3] });
    const r2 = [...r1, ...res(d2)];
    const d3 = dayGames(3, fields, r2, 217, rng);
    expect(d3).toHaveLength(108);
    const all = [...d1, ...d2, ...d3];
    for (const f of fields) expect(all.filter(g => g.tournament === f.id)).toHaveLength(12);
    const count = new Map<string, number>();
    for (const g of all) for (const t of [g.home, g.away]) count.set(t, (count.get(t) ?? 0) + 1);
    expect(count.size).toBe(216);
    expect([...count.values()].every(n => n === 3)).toBe(true);

    const r3 = [...r2, ...res(d3)];
    const table = tournamentTable(f0, all, r3);
    expect(table.map(r => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(tournamentChampion(f0, all, r3)).toBe(table[0].teamId);
    expect(tournamentChampion(f0, all, r2)).toBeNull();
  });
});
