import { describe, expect, it } from 'vitest';
import type { GameResult, QualifyingFile, ScheduleGame, WorldCupFile } from '../shared/types';
import { groupClinch, qualifyingClinch } from './clinch';

const id = (n: number) => `T${String(n).padStart(2, '0')}`;
const game = (s: ScheduleGame, homeWins: boolean): GameResult => ({ gameNo: s.gameNo, home: s.home, away: s.away, homePts: homeWins ? 80 : 70, awayPts: homeWins ? 70 : 80 }) as unknown as GameResult;
/** The lower-numbered team wins. */
const lowerWins = (s: ScheduleGame) => game(s, s.home < s.away);

function qualifyingFixture(played: number, advanced: string[] = []): QualifyingFile {
  const auto = Array.from({ length: 15 }, (_, i) => id(i + 1));
  const field = Array.from({ length: 70 }, (_, i) => id(i + 16));
  const schedule: ScheduleGame[] = [];
  for (let k = 1; k <= 3; k++) for (let i = 0; i < 70; i++) schedule.push({ gameNo: schedule.length + 1, home: field[i], away: field[(i + k) % 70] });
  const keys = Object.fromEntries([...auto, ...field].map((t, i) => [t, i / 100]));
  return { league: 'fbawc', season: 1, host: auto[0], auto, field, schedule, keys, games: schedule.slice(0, played).map(lowerWins), advanced };
}

function wcFixture(played: number): WorldCupFile {
  const letters = 'ABCDEFGHIJKLMNOP'.split('');
  const groups: Record<string, string[]> = {};
  letters.forEach((g, i) => { groups[g] = [1, 2, 3, 4].map(k => id(i * 4 + k)); });
  const single: [number, number][] = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  const schedule: ScheduleGame[] = [];
  for (const g of letters) {
    const t = groups[g];
    const order = [...single, ...single.map(([a, b]): [number, number] => [b, a])];
    for (const [a, b] of order) schedule.push({ gameNo: schedule.length + 1, home: t[a], away: t[b] });
  }
  const field = letters.flatMap(g => groups[g]);
  const keys = Object.fromEntries(field.map((t, i) => [t, i / 100]));
  return {
    league: 'fbawc', season: 2, host: field[0], field, pots: [field.slice(0, 16), field.slice(16, 32), field.slice(32, 48), field.slice(48)], groups, keys, schedule,
    groupGames: schedule.slice(0, played).map(lowerWins), knockout: [], champion: null, runnerUp: null,
  };
}

describe('qualifyingClinch', () => {
  it('keys all 15 auto and 70 field teams, auto always qualified', () => {
    const c = qualifyingClinch(qualifyingFixture(0));
    expect(Object.keys(c)).toHaveLength(85);
    for (let i = 1; i <= 15; i++) expect(c[id(i)]).toBe('qualified');
  });

  it('leaves everyone open before any game', () => {
    const c = qualifyingClinch(qualifyingFixture(0));
    for (let i = 16; i <= 85; i++) expect(c[id(i)]).toBeNull();
  });

  it('clinches a perfect team and eliminates a winless one once everyone has played', () => {
    const c = qualifyingClinch(qualifyingFixture(210));
    expect(c[id(16)]).toBe('qualified');
    expect(c[id(85)]).toBe('eliminated');
  });

  it('clinches and eliminates mid-way while games remain', () => {
    const f = qualifyingFixture(195);
    const c = qualifyingClinch(f);
    const left = f.schedule.length - f.games.length;
    expect(left).toBeGreaterThan(0);
    expect(c[id(16)]).toBe('qualified');
    expect(c[id(85)]).toBe('eliminated');
    expect(Object.values(c).filter(x => x === null).length).toBeGreaterThan(0);
  });

  it('uses the final order once qualifying is finished', () => {
    const f = qualifyingFixture(210);
    f.advanced = f.field.slice(0, 49);
    const c = qualifyingClinch(f);
    const field = f.field.map(t => c[t]);
    expect(field.filter(x => x === 'qualified')).toHaveLength(49);
    expect(field.filter(x => x === 'eliminated')).toHaveLength(21);
  });
});

describe('groupClinch', () => {
  it('keys the group four teams and leaves a tied situation open', () => {
    const c = groupClinch(wcFixture(2), 'A');
    expect(Object.keys(c).sort()).toEqual(['T01', 'T02', 'T03', 'T04']);
    expect(Object.values(c)).toEqual([null, null, null, null]);
  });

  it('advances a team rivals cannot catch and eliminates one that cannot finish top two', () => {
    const c = groupClinch(wcFixture(10), 'A');
    expect(c.T01).toBe('advanced');
    expect(c.T02).toBeNull();
    expect(c.T03).toBeNull();
    expect(c.T04).toBe('eliminated');
  });

  it('gives a finished group two advanced and two eliminated', () => {
    const c = groupClinch(wcFixture(12), 'A');
    const v = Object.values(c);
    expect(v.filter(x => x === 'advanced')).toHaveLength(2);
    expect(v.filter(x => x === 'eliminated')).toHaveLength(2);
  });
});
