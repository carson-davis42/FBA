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
