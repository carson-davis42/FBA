/*
 * Transcript format: `S<n>`, optional `G:<code>` (D2) or `K:NIT` (FBAJC), slot lines `seed|name|record`, then one `=` line per round
 * listing each series winner as `Name W-L`, `Name PTS-PTS` (a single game; any number above 4, optionally followed by ` OT`, ` 2OT`...), or `Name BYE`.
 * `Name -` (a single dash instead of the score) is an unscored series: the page printed only the winner.
 */
import { PastBracket, type PastSeries, type PastSide } from '../../engine/shared/types';

export type BracketGroup = 'PL' | 'WL' | 'UL' | 'IL';
/** FBAJC only: a page is a March Madness bracket (the default) or an NIT bracket (`K:NIT`). */
export type BracketKind = 'NIT';
export interface BracketEntry { season: number; group?: BracketGroup; kind?: BracketKind; rounds: number; series: PastSeries[] }

interface Page { season: number; group?: BracketGroup; kind?: BracketKind; slots: (PastSide | null)[]; results: string[][] }

const GROUPS: readonly string[] = ['PL', 'WL', 'UL', 'IL'];

/** Converts transcript text (one or more pages) into bracket entries, in page order. */
export function convertTranscript(text: string): { entries: BracketEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const pages: Page[] = [];
  let cur: Page | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^S\d+$/.test(line)) { cur = { season: Number(line.slice(1)), slots: [], results: [] }; pages.push(cur); continue; }
    if (!cur) throw new Error(`Line before any season: "${line}"`);
    if (line.startsWith('K:')) {
      const k = line.slice(2).trim();
      if (k !== 'NIT') throw new Error(`S${cur.season}: unknown page kind "${k}" (only NIT)`);
      cur.kind = k;
      continue;
    }
    if (line.startsWith('G:')) {
      const g = line.slice(2).trim();
      if (!GROUPS.includes(g)) throw new Error(`S${cur.season}: unknown group "${g}"`);
      cur.group = g as BracketGroup;
      continue;
    }
    if (line.startsWith('=')) { cur.results.push(line.slice(1).split('|').map(s => s.trim())); continue; }
    if (line === 'BYE') { cur.slots.push(null); continue; }
    const [seed, name, record] = line.split('|');
    if (name === undefined || !name.trim()) throw new Error(`S${cur.season}: can't parse slot "${line}"`);
    let rec: string | null = record?.trim() || null;
    if (rec && !/^\d+-\d+(-\d+)?$/.test(rec)) { warnings.push(`S${cur.season}: ${name.trim()} record "${rec}" -> null`); rec = null; }
    cur.slots.push({ name: name.trim(), record: rec, seed: seed?.trim() ? Number(seed) : null });
  }

  const seen = new Set<string>();
  const entries: BracketEntry[] = pages.map(p => {
    const key = `${p.season}${p.group ?? ''}${p.kind ?? ''}`;
    if (seen.has(key)) throw new Error(`Duplicate bracket for S${p.season}${p.group ? ` ${p.group}` : ''}${p.kind ? ` ${p.kind}` : ''}`);
    seen.add(key);
    const rounds = Math.log2(p.slots.length);
    if (!Number.isInteger(rounds) || rounds < 1 || p.results.length !== rounds) throw new Error(`S${p.season}: bad shape (${p.slots.length} slots, ${p.results.length} result lines)`);
    const series: PastSeries[] = [];
    let sides = p.slots;
    for (let r = 1; r <= rounds; r++) {
      const res = p.results[r - 1];
      if (res.length !== sides.length / 2) throw new Error(`S${p.season} R${r}: ${res.length} results for ${sides.length} sides`);
      const next: (PastSide | null)[] = [];
      res.forEach((txt, i) => {
        const home = sides[2 * i], away = sides[2 * i + 1];
        const m = /^(.*) (BYE|-|(\d+)-(\d+)( \d?OT)?)$/.exec(txt);
        if (!m) throw new Error(`S${p.season} R${r}-${i + 1}: can't parse "${txt}"`);
        const wname = m[1];
        const winner = home?.name === wname ? 'home' : away?.name === wname ? 'away' : null;
        if (!winner) throw new Error(`S${p.season} R${r}-${i + 1}: winner ${wname} not in series`);
        const bye = m[2] === 'BYE';
        if (bye !== (!home || !away)) throw new Error(`S${p.season} R${r}-${i + 1}: BYE mismatch`);
        const unscored = m[2] === '-';
        const w = bye || unscored ? 0 : Number(m[3]), l = bye || unscored ? 0 : Number(m[4]);
        const single = w > 4 || l > 4;
        const s: PastSeries = {
          id: `R${r}-${i + 1}`, round: r, home, away,
          homeWins: single ? (winner === 'home' ? 1 : 0) : winner === 'home' ? w : l,
          awayWins: single ? (winner === 'home' ? 0 : 1) : winner === 'home' ? l : w,
          winner,
        };
        if (unscored) s.unscored = true;
        if (single) s.score = `${w}–${l}${m[5] ?? ''}`;
        series.push(s);
        next.push(winner === 'home' ? home : away);
      });
      sides = next;
    }
    const entry: BracketEntry = { season: p.season, ...(p.group ? { group: p.group } : {}), ...(p.kind ? { kind: p.kind } : {}), rounds, series };
    const parsed = PastBracket.safeParse({ rounds, series });
    if (!parsed.success) throw new Error(`S${p.season}${p.group ? ` ${p.group}` : ''}${p.kind ? ` ${p.kind}` : ''}: ${parsed.error.issues.map(i => i.message).join('; ')}`);
    return entry;
  });
  return { entries, warnings };
}
