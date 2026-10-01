import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { schemaForPath } from '../../engine/shared/schemaRegistry';
import type { PastBracket, SummaryFile } from '../../engine/shared/types';
import type { BracketEntry } from './convertBrackets';

export interface MergeReport { set: number; unchanged: number; missingSummary: string[] }
const GROUP_ORDER = ['PL', 'WL', 'UL', 'IL'];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Pure: puts transcribed brackets onto the matching season summaries. Returns only the summaries that changed. */
export function mergeBrackets(league: 'fbawc' | 'fbad2', entries: BracketEntry[], summaries: Map<number, SummaryFile>): { summaries: SummaryFile[]; report: MergeReport } {
  if (league === 'fbad2') {
    const bySeason = new Map<number, BracketEntry[]>();
    for (const e of entries) bySeason.set(e.season, [...(bySeason.get(e.season) ?? []), e]);
    for (const [season, list] of bySeason) {
      if (list.some(e => e.group) && list.some(e => !e.group)) throw new Error(`S${season}: mixes a grouped and a group-less bracket`);
    }
  }
  const next = new Map<number, SummaryFile>();
  const touched = new Set<number>();
  const report: MergeReport = { set: 0, unchanged: 0, missingSummary: [] };
  for (const e of entries) {
    const base = next.get(e.season) ?? summaries.get(e.season);
    if (!base) { report.missingSummary.push(`S${e.season}${e.group ? ` ${e.group}` : ''}`); continue; }
    const bracket: PastBracket = { rounds: e.rounds, series: e.series };
    let updated: SummaryFile;
    if (league === 'fbad2' && e.group) {
      const have = base.pastBrackets ?? [];
      if (same(have.find(p => p.group === e.group)?.bracket, bracket)) { report.unchanged++; continue; }
      const list = [...have.filter(p => p.group !== e.group), { group: e.group, bracket }]
        .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
      updated = { ...base, pastBrackets: list };
    } else {
      if (same(base.pastBracket, bracket)) { report.unchanged++; continue; }
      updated = { ...base, pastBracket: bracket };
    }
    next.set(e.season, updated);
    touched.add(e.season);
    report.set++;
  }
  return { summaries: [...touched].sort((a, b) => a - b).map(n => next.get(n)!), report };
}

/** Reads the league's summaries from `dir`, merges, validates, and writes the changed ones. Writes nothing if any fails its schema. */
export function runBracketImport(league: 'fbawc' | 'fbad2', entries: BracketEntry[], dir: string): { report: MergeReport; problems: string[] } {
  const existing = new Map<number, SummaryFile>();
  for (let n = 1; n <= 200; n++) {
    const file = path.join(dir, 'leagues', league, `S${n}`, 'summary.json');
    if (existsSync(file)) existing.set(n, JSON.parse(readFileSync(file, 'utf8')) as SummaryFile);
  }
  const { summaries, report } = mergeBrackets(league, entries, existing);
  const docs = summaries.map((s): [string, SummaryFile] => [`leagues/${league}/S${s.season}/summary.json`, s]);
  const problems = docs.flatMap(([rel, doc]) => {
    const r = schemaForPath(rel)?.safeParse(doc);
    return r?.success ? [] : [`${rel}: ${r ? r.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : 'no schema'}`];
  });
  if (problems.length) return { report, problems };
  for (const [rel, doc] of docs) {
    const file = path.join(dir, ...rel.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
  return { report, problems };
}
