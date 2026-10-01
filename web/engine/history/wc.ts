import type { SummaryFile } from '../shared/types';

export interface WcTitleRow { season: number; host: string | null; champion: string; championId?: string; runnerUp: string | null; runnerUpId?: string; mvp: string | null; mvpName: string | null }
const TITLE = 'World Cup Champion';

export function wcTitleRows(seasons: SummaryFile[]): WcTitleRow[] {
  const rows: WcTitleRow[] = [];
  for (const s of seasons) {
    const c = s.champions.find(x => x.title === TITLE);
    if (c) rows.push({ season: s.season, host: s.host, champion: c.champion, championId: c.teamId, runnerUp: c.runnerUp, runnerUpId: c.runnerUpId, mvp: c.finalsMvp ?? null, mvpName: c.mvpName ?? null });
  }
  return rows.sort((a, b) => b.season - a.season);
}

export function titlesByCountry(rows: WcTitleRow[]): { country: string; teamId?: string; titles: number; seasons: number[] }[] {
  const by = new Map<string, { country: string; teamId?: string; titles: number; seasons: number[] }>();
  for (const r of rows) {
    const e = by.get(r.champion) ?? { country: r.champion, teamId: r.championId, titles: 0, seasons: [] };
    e.titles++;
    e.seasons.push(r.season);
    by.set(r.champion, e);
  }
  const out = [...by.values()];
  for (const e of out) e.seasons.sort((a, b) => a - b);
  return out.sort((a, b) => b.titles - a.titles || (a.country < b.country ? -1 : 1));
}
