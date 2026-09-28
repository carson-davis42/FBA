import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { ScheduleGame } from '../shared/types';
import { buildSchedule, defaultPauses, gameDays } from './schedule';

const fbaTeams = Array.from({ length: 30 }, (_, k) => ({ teamId: `T${k}`, group: k < 15 ? 'E' : 'W' }));
const d2Groups = ['PL', 'WL', 'UL', 'IL'];
const d2Teams = Array.from({ length: 64 }, (_, k) => ({ teamId: `D${k}`, group: d2Groups[Math.floor(k / 16)] }));

function tally(games: ScheduleGame[]) {
  const per = new Map<string, { games: number; home: number }>();
  const pairs = new Map<string, { total: number; homeOf: Map<string, number> }>();
  for (const g of games) {
    for (const [id, isHome] of [[g.home, true], [g.away, false]] as const) {
      const t = per.get(id) ?? { games: 0, home: 0 };
      t.games++;
      if (isHome) t.home++;
      per.set(id, t);
    }
    const key = [g.home, g.away].sort().join('|');
    const p = pairs.get(key) ?? { total: 0, homeOf: new Map<string, number>() };
    p.total++;
    p.homeOf.set(g.home, (p.homeOf.get(g.home) ?? 0) + 1);
    pairs.set(key, p);
  }
  return { per, pairs };
}

describe('buildSchedule', () => {
  it('FBA: 1290 games, 86 per team (43 home), 4 per conference pair, 2 per cross pair', () => {
    const games = buildSchedule('fba', fbaTeams, mulberry32(1));
    expect(games).toHaveLength(1290);
    expect(games.map(g => g.gameNo)).toEqual(Array.from({ length: 1290 }, (_, k) => k + 1));
    const { per, pairs } = tally(games);
    for (const t of fbaTeams) expect(per.get(t.teamId)).toEqual({ games: 86, home: 43 });
    for (const [key, p] of pairs) {
      const [a, b] = key.split('|');
      const same = fbaTeams.find(t => t.teamId === a)!.group === fbaTeams.find(t => t.teamId === b)!.group;
      expect(p.total).toBe(same ? 4 : 2);
      expect(p.homeOf.get(a)).toBe(same ? 2 : 1);
      expect(p.homeOf.get(b)).toBe(same ? 2 : 1);
    }
    expect(pairs.size).toBe((30 * 29) / 2);
  });

  it('D2: 960 games, a double round-robin inside each league', () => {
    const games = buildSchedule('fbad2', d2Teams, mulberry32(2));
    expect(games).toHaveLength(960);
    const { per, pairs } = tally(games);
    for (const t of d2Teams) expect(per.get(t.teamId)).toEqual({ games: 30, home: 15 });
    expect(pairs.size).toBe(4 * ((16 * 15) / 2));
    for (const [key, p] of pairs) {
      const [a, b] = key.split('|');
      expect(d2Teams.find(t => t.teamId === a)!.group).toBe(d2Teams.find(t => t.teamId === b)!.group);
      expect(p.total).toBe(2);
      expect(p.homeOf.get(a)).toBe(1);
    }
  });

  it('is deterministic for a seed', () => {
    expect(buildSchedule('fba', fbaTeams, mulberry32(5))).toEqual(buildSchedule('fba', fbaTeams, mulberry32(5)));
  });
});

describe('gameDays', () => {
  it('packs games in order into days where no team plays twice', () => {
    const games = [
      { gameNo: 1, home: 'A', away: 'B' }, { gameNo: 2, home: 'C', away: 'D' },
      { gameNo: 3, home: 'A', away: 'C' }, { gameNo: 4, home: 'B', away: 'D' }, { gameNo: 5, home: 'E', away: 'F' },
    ];
    expect(gameDays(games)).toEqual([[1, 2], [3, 4, 5]]);
    expect(gameDays([])).toEqual([]);
  });

  it('never repeats a team within a day on a real schedule', () => {
    const games = buildSchedule('fba', fbaTeams, mulberry32(3));
    const days = gameDays(games);
    expect(days.flat()).toEqual(games.map(g => g.gameNo));
    for (const day of days) {
      const ids = day.flatMap(n => [games[n - 1].home, games[n - 1].away]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('defaultPauses', () => {
  it('uses the Java quarter points for the FBA and none for D2', () => {
    expect(defaultPauses('fba', 1290)).toEqual([
      { afterGame: 322, kind: 'ratings', done: false },
      { afterGame: 645, kind: 'ratings', done: false },
      { afterGame: 645, kind: 'deadline', done: false },
      { afterGame: 967, kind: 'ratings', done: false },
      { afterGame: 967, kind: 'allstar', done: false },
    ]);
    expect(defaultPauses('fbad2', 960)).toEqual([]);
  });
});
