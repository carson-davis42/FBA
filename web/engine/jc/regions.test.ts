import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from '../d2/random';
import { playableGames, recordResult } from './bracket';
import { buildMarchMadness, placeRegions } from './regions';

const CODES = ['B12', 'ACC', 'BE', 'SEC', 'B10', 'AAC', 'P12', 'A10', 'MWC', 'PAT', 'COL', 'HOR', 'IVY', 'SOCON', 'SUN', 'SKY', 'OVC', 'NEC'];
const confOf = (id: string): string => CODES[Number(id.slice(1)) % 18];
const ids = Array.from({ length: 64 }, (_, i) => `t${String(i).padStart(3, '0')}`);

describe('placeRegions', () => {
  it('puts one team of every seed in every region, seed 1s in regions 1-4 and seed 2s in 4-1', () => {
    const { seeds, regions } = placeRegions(ids, confOf);
    expect(regions).toHaveLength(4);
    regions.forEach(r => {
      expect(r).toHaveLength(16);
      expect(r.map(t => seeds[t])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(s => s));
    });
    expect(regions.map(r => r[0])).toEqual(ids.slice(0, 4));
    expect(regions.map(r => r[1])).toEqual([ids[7], ids[6], ids[5], ids[4]]);
    expect(new Set(regions.flat()).size).toBe(64);
  });

  it('keeps every seed line together: seed s has the field teams 4(s-1) to 4s-1', () => {
    const { seeds } = placeRegions(ids, confOf);
    ids.forEach((t, i) => expect(seeds[t]).toBe(Math.floor(i / 4) + 1));
  });

  it('avoids a same-conference round-1 meeting whenever the other regions allow it', () => {
    for (let n = 0; n < 20; n++) {
      const field = shuffle(ids, mulberry32(n));
      const { regions } = placeRegions(field, confOf);
      let clashes = 0;
      for (const r of regions) for (let s = 0; s < 8; s++) if (confOf(r[s]) === confOf(r[15 - s])) clashes++;
      // With 18 conferences spread evenly there is always room to separate round-1 opponents.
      expect(clashes).toBe(0);
    }
  });

  it('is deterministic and refuses a field that is not 64 teams', () => {
    expect(placeRegions(ids, confOf)).toEqual(placeRegions(ids, confOf));
    expect(() => placeRegions(ids.slice(1), confOf)).toThrow(/64/);
  });

  it('puts two teams of one conference in different regions when it can', () => {
    // Every 18th team is a B12 team: t000, t018, t036 and t054.
    const { regions } = placeRegions(ids, confOf);
    const regionOf = (t: string) => regions.findIndex(r => r.includes(t));
    const sameConf = ids.filter(t => confOf(t) === 'B12');
    const where = sameConf.map(regionOf);
    expect(new Set(where).size).toBeGreaterThan(1);
  });
});

describe('buildMarchMadness', () => {
  const { seeds, regions } = placeRegions(ids, confOf);
  const b = buildMarchMadness(regions, seeds);

  it('has 63 games, 32 in round 1 with both teams known', () => {
    expect(b.games).toHaveLength(63);
    const first = b.games.filter(g => g.round === 1);
    expect(first).toHaveLength(32);
    for (const g of first) {
      expect(g.home && g.away).toBeTruthy();
      expect(g.homeSeed! + g.awaySeed!).toBe(17);
    }
    expect(b.games.filter(g => g.round === 2)).toHaveLength(16);
    expect(b.games.filter(g => g.round === 3)).toHaveLength(8);
    expect(b.games.filter(g => g.round === 4)).toHaveLength(4);
    expect(b.games.filter(g => g.round === 5)).toHaveLength(2);
    expect(b.games.filter(g => g.round === 6)).toHaveLength(1);
  });

  it('pairs seed s with 17 - s in round 1, in the Java order 1, 8, 5, 4, 3, 6, 7, 2', () => {
    const r1 = b.games.filter(g => g.region === 0 && g.round === 1);
    expect(r1.map(g => [g.homeSeed, g.awaySeed])).toEqual([[1, 16], [8, 9], [5, 12], [4, 13], [3, 14], [6, 11], [7, 10], [2, 15]]);
  });

  it('plays out to a champion with the Java advance mapping', () => {
    let cur = b;
    let n = 0;
    while (playableGames(cur).length) {
      for (const g of playableGames(cur)) {
        cur = recordResult(cur, g.id, { gameNo: ++n, home: g.home!, away: g.away!, homePts: 70, awayPts: 60 });
      }
    }
    expect(n).toBe(63);
    // home always wins here: the seed 1 of region 1 wins region 1, the seed 1 of region 4 wins FF1 (home is region 1), and region 1's champion wins it all.
    expect(cur.champion).toBe(regions[0][0]);
  });

  it('puts region 1 and region 4 in one Final Four game and regions 2 and 3 in the other', () => {
    const e1 = b.games.find(g => g.id === 'R1-15')!;
    const e4 = b.games.find(g => g.id === 'R4-15')!;
    const e2 = b.games.find(g => g.id === 'R2-15')!;
    const e3 = b.games.find(g => g.id === 'R3-15')!;
    expect(e1.next).toEqual({ id: 'FF1', side: 'home' });
    expect(e4.next).toEqual({ id: 'FF1', side: 'away' });
    expect(e2.next).toEqual({ id: 'FF2', side: 'home' });
    expect(e3.next).toEqual({ id: 'FF2', side: 'away' });
    expect(b.games.find(g => g.id === 'FF1')!.next).toEqual({ id: 'NC', side: 'home' });
  });
});
