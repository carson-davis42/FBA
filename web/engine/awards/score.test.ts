import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { americanOdds, awardScore, raceOdds } from './score';

const JAVA = path.join(__dirname, '..', '..', '..', 'FBA');
const read = (f: string) => readFileSync(path.join(JAVA, f), 'utf8').split(/\r?\n/);

/** S78 inputs straight from the Java's files: exact points (FBARosters.txt), team records (Results.txt), 86 games each. */
function s78Players() {
  const rec: Record<string, { w: number; l: number }> = {};
  for (const l of read('Results.txt').filter(x => x.trim().length > 1)) {
    const a = l.split(',');
    const [h, hp, w, wp] = [a[1], Number(a[2]), a[3], Number(a[4])];
    for (const t of [h, w]) rec[t] ??= { w: 0, l: 0 };
    if (hp > wp) { rec[h].w++; rec[w].l++; } else { rec[w].w++; rec[h].l++; }
  }
  const players: { name: string; pos: string; rating: number; ppg: number; winPct: number }[] = [];
  let team = '';
  for (const l of read('FBARosters.txt')) {
    const a = l.split('/');
    if (a.length === 3) team = a[0];
    else if (a.length === 7) {
      const r = rec[team];
      const g = r.w + r.l;
      players.push({ name: a[0], pos: a[1], rating: Number(a[5]), ppg: Number(a[6]) / g, winPct: r.w / g });
    }
  }
  return players;
}

/** The Java's printed race: rank 1–10, name and odds, read by its printf columns. */
function javaRace(title: string): { name: string; odds: string }[] {
  const t = read('Awards.txt');
  const i = t.findIndex(r => r.includes(title));
  return t.slice(i + 3, i + 13).map(r => ({ name: r.slice(6, 26).trim(), odds: r.slice(52).trim() }));
}

describe('awardScore and raceOdds reproduce the Java S78 races', () => {
  const players = s78Players();
  const cases: [string, string[]][] = [
    ['MVP Race', ['PG', 'SG', 'SF', 'PF', 'C']],
    ['PPK Award Race', ['PG', 'SG']],
    ['LP Award Race', ['SF', 'PF']],
    ['MC Award Race', ['C']],
  ];
  for (const [title, positions] of cases) {
    it(title, () => {
      const race = players.filter(p => positions.includes(p.pos))
        .map(p => ({ ...p, score: awardScore(p.ppg, p.rating, p.winPct) }))
        .sort((a, b) => b.score - a.score || b.ppg - a.ppg || b.rating - a.rating)
        .slice(0, 10);
      const odds = raceOdds(race.map(r => r.score));
      expect(race.map((r, k) => ({ name: r.name, odds: odds[k] }))).toEqual(javaRace(title));
    });
  }
});

describe('americanOdds', () => {
  it('handles even money, favourites, longshots and the clamps', () => {
    expect(americanOdds(0.5)).toBe('+100');
    expect(americanOdds(0.75)).toBe('-300');
    expect(americanOdds(0.2)).toBe('+400');
    expect(americanOdds(0.999999)).toBe('-5000');
    expect(americanOdds(0)).toBe('+10000');
  });
});

describe('raceOdds display caps', () => {
  it('caps places 1–6 at +6000, 7–8 at +8000, and gives 9–10 +10000', () => {
    const odds = raceOdds([100, 60, 59, 58, 57, 56, 55, 54, 53, 52]);
    expect(odds[0]).toBe('-5000');
    expect(odds.slice(1, 6)).toEqual(['+6000', '+6000', '+6000', '+6000', '+6000']);
    expect(odds.slice(6, 8)).toEqual(['+8000', '+8000']);
    expect(odds.slice(8)).toEqual(['+10000', '+10000']);
  });
  it('uses the whole list as the pool when it is short', () => {
    expect(raceOdds([50, 50])).toEqual(['+100', '+100']);
    expect(raceOdds([])).toEqual([]);
  });
});
