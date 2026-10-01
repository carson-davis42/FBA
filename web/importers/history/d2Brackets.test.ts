import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PastBracket } from '../../engine/shared/types';
import { normName } from '../history';
import data from './d2Brackets.json';

interface Entry extends PastBracket { season: number; group?: string }
const entries = data as unknown as Entry[];

/** Keys like `S55` or `S76 WL` where the bracket page itself disagrees with the league summary; the page is kept. */
const ALLOWED_MISMATCH: string[] = [];
/** Pages with no summary.json (the page prints S54, which has none). */
const NO_SUMMARY: string[] = ['S54'];
/** Old pages print team nicknames ("San Jose Express"); summaries use the city. */
const sameTeam = (page: string, city: string) => normName(page) === normName(city) || normName(page).startsWith(normName(city) + ' ');
const ORDER = ['PL', 'WL', 'UL', 'IL'];
const key = (e: Entry) => `S${e.season}${e.group ? ' ' + e.group : ''}`;

describe('d2Brackets.json', () => {
  it('has at least 39 entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(39);
  });

  it('each entry passes PastBracket', () => {
    for (const { season, group, ...b } of entries) {
      const r = PastBracket.safeParse(b);
      expect(r.success ? null : { season, group, issues: r.error.issues.map(i => i.message) }).toBeNull();
    }
  });

  it('is sorted by season then group', () => {
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1], b = entries[i];
      const d = a.season - b.season || ORDER.indexOf(a.group ?? '') - ORDER.indexOf(b.group ?? '');
      expect(d).toBeLessThan(0);
    }
  });

  it('each final matches the league summary', () => {
    const bad: string[] = [];
    for (const e of entries) {
      if (ALLOWED_MISMATCH.includes(key(e)) || NO_SUMMARY.includes(key(e))) continue;
      const sum = JSON.parse(readFileSync(new URL(`../../data/leagues/fbad2/S${e.season}/summary.json`, import.meta.url), 'utf8'));
      const list = sum.champions as { title: string; group?: string | null; champion: string; runnerUp?: string | null }[];
      const cands = e.group
        ? list.filter(c => c.group === e.group)
        // S55 has two titles, '(1)' and '(2)'; the page's final matches (2).
        : list.filter(c => c.title.startsWith('D2 International Champion'));
      if (cands.length === 0) { bad.push(`${key(e)}: no matching champion in summary`); continue; }
      const f = e.series.find(s => s.id === `R${e.rounds}-1`)!;
      const win = f[f.winner]!;
      const lose = f[f.winner === 'home' ? 'away' : 'home'];
      const ok = cands.some(c => sameTeam(win.name, c.champion)
        && (!c.runnerUp || (lose !== null && sameTeam(lose.name, c.runnerUp))));
      if (!ok) bad.push(`${key(e)}: ${win.name} over ${lose?.name ?? 'BYE'} vs summary ${cands.map(c => `${c.champion} over ${c.runnerUp ?? '?'}`).join(' / ')}`);
    }
    expect(bad).toEqual([]);
  });
});
