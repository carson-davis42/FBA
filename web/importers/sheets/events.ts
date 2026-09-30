import type { EventsFile } from '../../engine/shared/types';

export function parseEventsTab(rows: string[][]): { before: { label: string; notes: string[] }[]; seasons: { season: number; notes: string[] }[] } {
  const before: { label: string; notes: string[] }[] = [];
  const seasons: { season: number; notes: string[] }[] = [];
  for (const r of rows) {
    const a = (r[0] ?? '').trim();
    const notes = r.slice(1).map(c => (c ?? '').trim()).filter(Boolean);
    if (!notes.length) continue;
    if (/^FFL S\d+$/.test(a)) before.push({ label: a, notes });
    const m = a.match(/^S(\d+)$/);
    if (m) seasons.push({ season: Number(m[1]), notes });
  }
  return { before, seasons };
}

export function buildEvents(parsed: ReturnType<typeof parseEventsTab>, rules: { season: number; lines: string[] }[]): EventsFile {
  const by = new Map<number, { season: number; notes: string[]; rules: string[] }>();
  const at = (s: number) => by.get(s) ?? by.set(s, { season: s, notes: [], rules: [] }).get(s)!;
  for (const s of parsed.seasons) at(s.season).notes.push(...s.notes);
  for (const r of rules) at(r.season).rules.push(...r.lines);
  return { before: parsed.before, seasons: [...by.values()].sort((a, b) => a.season - b.season) };
}
