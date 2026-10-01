import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PastBracket } from '../../engine/shared/types';
import { normName } from '../history';
import data from './wcBrackets.json';

interface Entry extends PastBracket { season: number }
const entries = data as unknown as Entry[];

/** Seasons where the bracket page itself disagrees with the league summary; the page is kept. */
const ALLOWED_MISMATCH: number[] = [];

describe('wcBrackets.json', () => {
  it('has all 12 World Cups', () => {
    expect(entries.length).toBe(12);
    expect(entries.map(e => e.season)).toEqual([56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78]);
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

  it('each final matches the league summary', () => {
    const bad: string[] = [];
    for (const e of entries) {
      if (ALLOWED_MISMATCH.includes(e.season)) continue;
      const sum = JSON.parse(readFileSync(new URL(`../../data/leagues/fbawc/S${e.season}/summary.json`, import.meta.url), 'utf8'));
      const champ = (sum.champions as { title: string; champion: string; runnerUp?: string | null }[]).find(c => c.title === 'World Cup Champion');
      if (!champ) { bad.push(`S${e.season}: no World Cup Champion in summary`); continue; }
      const f = e.series.find(s => s.id === `R${e.rounds}-1`)!;
      const win = f[f.winner]!;
      const lose = f[f.winner === 'home' ? 'away' : 'home'];
      const ok = normName(win.name) === normName(champ.champion)
        && (!champ.runnerUp || (lose !== null && normName(lose.name) === normName(champ.runnerUp)));
      if (!ok) bad.push(`S${e.season}: ${win.name} over ${lose?.name ?? 'BYE'} vs summary ${champ.champion} over ${champ.runnerUp ?? '?'}`);
    }
    expect(bad).toEqual([]);
  });
});
