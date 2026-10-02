import type { SummaryFile, Team } from '../shared/types';

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

export interface WcAppearance { season: number; host: string | null; /** The deepest round reached, "Champion" or "Runner-up"; null when the page has no bracket and the country neither won nor lost the final. */ result: string | null }

/** Every World Cup a country is known to have played: a title or runner-up finish in the summary, or a place in the transcribed bracket. Newest first. */
export function wcAppearances(team: Team, seasons: SummaryFile[]): WcAppearance[] {
  const out: WcAppearance[] = [];
  for (const s of seasons) {
    const c = s.champions.find(x => x.title === TITLE);
    const won = !!c && (c.teamId === team.teamId || (c.teamId === undefined && c.champion === team.name));
    const lost = !!c && (c.runnerUpId === team.teamId || (c.runnerUpId === undefined && c.runnerUp === team.name));
    const rounds = s.pastBracket?.rounds ?? 0;
    const deepest = (s.pastBracket?.series ?? []).reduce((m, x) => ((x.home?.name === team.name || x.away?.name === team.name) ? Math.max(m, x.round) : m), 0);
    if (!won && !lost && deepest === 0) continue;
    const result = won ? 'Champion' : lost ? 'Runner-up' : rounds > 0 ? roundReached(rounds, deepest) : null;
    out.push({ season: s.season, host: s.host, result });
  }
  return out.sort((a, b) => b.season - a.season);
}

/** Where a team went out, by the number of teams left in that round. */
function roundReached(rounds: number, round: number): string {
  const left = 2 ** (rounds - round + 1);
  return left === 2 ? 'Final' : left === 4 ? 'Semi-final' : left === 8 ? 'Quarter-final' : `Round of ${left}`;
}
