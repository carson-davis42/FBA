import { describe, it, expect } from 'vitest';
import { PastBracket } from '../../engine/shared/types';
import { normName } from '../history';
import data from './fbaBrackets.json';
import fixture from './championships.fixture.json';

interface Entry extends PastBracket { season: number }
interface ChampFixture { season: number; champion: string; runnerUp: string | null; score: string | null }

const entries = data as unknown as Entry[];
const champs = fixture as ChampFixture[];

/** Seasons where the bracket page itself disagrees with the Championships sheet; the page is kept. */
const ALLOWED_MISMATCH: number[] = [];

describe('fbaBrackets.json', () => {
  it('has the transcribed pages', () => {
    // 46 pages, 19 of them skipped (FBA D2 Tournament / D2 World Cup): 12 in part 1, 7 in part 2.
    expect(entries.length).toBeGreaterThanOrEqual(27);
  });

  it('each entry passes PastBracket', () => {
    for (const { season, ...b } of entries) {
      const r = PastBracket.safeParse(b);
      expect(r.success ? null : { season, issues: r.error.issues.map(i => i.message) }).toBeNull();
    }
  });

  it('seeds the 16-slot pages by conference: each half of the page is one conference, seeded 1, 8, 4, 5, 3, 6, 2, 7 down the slots, and wins fall with the seed', () => {
    const order = [1, 8, 4, 5, 3, 6, 2, 7];
    for (const { season, series } of entries.filter(e => e.season >= 62)) {
      const r1 = series.filter(s => s.round === 1).sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
      const halves: { seed: number; wins: number | null }[][] = [[], []];
      r1.forEach((s, i) => [s.home, s.away].forEach((x, k) => {
        if (!x) return;
        expect(x.seed, `S${season} ${s.id}`).toBe(order[(2 * i + k) % 8]);
        halves[i < 4 ? 0 : 1].push({ seed: x.seed!, wins: x.record ? Number(x.record.split('-')[0]) : null });
      }));
      for (const h of halves) {
        const w = h.sort((a, b) => a.seed - b.seed).map(x => x.wins).filter((x): x is number => x !== null);
        expect(w, `S${season}`).toEqual([...w].sort((a, b) => b - a));
      }
    }
  });

  it('has unique, ascending seasons', () => {
    for (let i = 1; i < entries.length; i++) expect(entries[i].season).toBeGreaterThan(entries[i - 1].season);
  });

  it('each final matches the Championships sheet', () => {
    const bad: string[] = [];
    for (const e of entries) {
      if (ALLOWED_MISMATCH.includes(e.season)) continue;
      const c = champs.find(x => x.season === e.season);
      if (!c) { bad.push(`S${e.season}: no fixture row`); continue; }
      const f = e.series.find(s => s.id === `R${e.rounds}-1`)!;
      const win = f[f.winner]!;
      const lose = f[f.winner === 'home' ? 'away' : 'home'];
      const winWins = f.winner === 'home' ? f.homeWins : f.awayWins;
      const loseWins = f.winner === 'home' ? f.awayWins : f.homeWins;
      const ok = normName(win.name) === normName(c.champion)
        && (c.runnerUp === null || (lose !== null && normName(lose.name) === normName(c.runnerUp)))
        && (c.score === null || `${winWins}–${loseWins}` === c.score);
      if (!ok) bad.push(`S${e.season}: ${win.name} ${winWins}–${loseWins} ${lose?.name ?? 'BYE'} vs sheet ${c.champion} ${c.score ?? '?'} ${c.runnerUp ?? '?'}`);
    }
    expect(bad).toEqual([]);
  });
});
