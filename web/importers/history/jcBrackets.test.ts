import { describe, it, expect } from 'vitest';
import { PastBracket } from '../../engine/shared/types';
import { normName } from '../history';
import { SHEET_SCHOOL_ALIASES } from '../jcHistory';
import data from './jcBrackets.json';
import fixture from './jcChampionships.fixture.json';

interface Entry extends PastBracket { season: number; kind?: 'NIT' }
interface ChampFixture { season: number; kind: 'MM' | 'NIT'; champion: string; runnerUp: string | null; score: string | null }

const entries = data as unknown as Entry[];
const champs = fixture as ChampFixture[];

describe('seeds', () => {
  it('gives every first-round team the grey seed printed beside its slot: 1 to 16 in each block of 16 slots, in the pages\' fixed order', () => {
    const order = [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2];
    for (const e of entries) {
      const r1 = e.series.filter(s => s.round === 1).sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
      r1.forEach((s, i) => {
        if (s.home) expect(s.home.seed, `S${e.season}${e.kind ?? ''} ${s.id}`).toBe(order[(2 * i) % 16]);
        if (s.away) expect(s.away.seed, `S${e.season}${e.kind ?? ''} ${s.id}`).toBe(order[(2 * i + 1) % 16]);
      });
    }
  });
});

/** Brackets where the page itself disagrees with the history workbook; the page is kept. Add only with the commissioner's approval. */
const ALLOWED_MISMATCH: string[] = [];

const key = (e: { season: number; kind?: 'NIT' }) => `S${e.season}${e.kind ? ' NIT' : ''}`;
const sameSchool = (a: string, b: string) => normName(SHEET_SCHOOL_ALIASES[a] ?? a) === normName(SHEET_SCHOOL_ALIASES[b] ?? b);
const digits = (s: string) => s.replace(/ ?\d?OT$/, '').replace('–', '-');

describe('jcBrackets.json', () => {
  it('has all 39 March Madness pages and the 7 NIT pages', () => {
    expect(entries.filter(e => !e.kind)).toHaveLength(39);
    expect(entries.filter(e => e.kind === 'NIT').map(e => e.season)).toEqual([72, 73, 74, 75, 76, 77, 78]);
  });

  it('each entry passes PastBracket', () => {
    for (const { season, kind, ...b } of entries) {
      const r = PastBracket.safeParse(b);
      expect(r.success ? null : { season, kind, issues: r.error.issues.map(i => i.message) }).toBeNull();
    }
  });

  it('has one March Madness entry per season and at most one NIT entry, in ascending order', () => {
    const keys = entries.map(key);
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < entries.length; i++) expect(entries[i].season).toBeGreaterThanOrEqual(entries[i - 1].season);
  });

  it('each final matches the champion and runner-up in the history workbook', () => {
    const bad: string[] = [];
    for (const e of entries) {
      if (ALLOWED_MISMATCH.includes(key(e))) continue;
      const kind = e.kind ?? 'MM';
      const c = champs.find(x => x.season === e.season && x.kind === kind);
      if (!c) { bad.push(`${key(e)}: no workbook row`); continue; }
      const f = e.series.find(s => s.id === `R${e.rounds}-1`)!;
      const win = f[f.winner]!;
      const lose = f[f.winner === 'home' ? 'away' : 'home'];
      const ok = sameSchool(win.name, c.champion)
        && (c.runnerUp === null || (lose !== null && sameSchool(lose.name, c.runnerUp)))
        && (c.score === null || f.score === undefined || digits(f.score) === digits(c.score));
      if (!ok) bad.push(`${key(e)}: ${win.name} ${f.score ?? ''} ${lose?.name ?? 'BYE'} vs workbook ${c.champion} ${c.score ?? '?'} ${c.runnerUp ?? '?'}`);
    }
    expect(bad).toEqual([]);
  });

  it('every season with a bracket is a college season that has a champion', () => {
    for (const e of entries) expect(champs.some(c => c.season === e.season), key(e)).toBe(true);
  });
});
