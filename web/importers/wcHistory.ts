import { WC_FLAGS } from '../engine/shared/flags';
import type { Champion, PlayersFile, SummaryFile, TeamsFile, WcHostsFile } from '../engine/shared/types';
import { nameResolver } from './history';
import type { Report } from './report';
import { parseWorldCups } from './sheets/wcHistory';

export const WC_SHEET_TAB = 'D2 World Cups';
export interface WcCtx { players: PlayersFile; teams: TeamsFile; existing: Map<number, SummaryFile> }

/** Sheet spellings mapped to the fbawc team name. */
const SHEET_TEAM_ALIASES: Record<string, string> = { UK: 'England' };

/** Sheet wins the ids and the MVP; the existing champion/runner-up text and score are kept. */
function mergeChampion(built: Champion, existing: Champion | undefined): Champion {
  if (!existing) return built;
  return { ...existing, teamId: built.teamId, runnerUpId: built.runnerUpId, finalsMvp: built.finalsMvp };
}

export function buildWcHistory(rows: string[][], ctx: WcCtx, report: Report): { summaries: SummaryFile[]; hosts: WcHostsFile; teams: TeamsFile } {
  const byName = new Map(ctx.teams.teams.map(t => [t.name, t.teamId]));
  const resolve = nameResolver(ctx.players, report, 'wc-history');
  const teamId = (raw: string, where: string): string | undefined => {
    const name = SHEET_TEAM_ALIASES[raw] ?? raw;
    if (name !== raw) report.info('wc-teams', `Sheet "${raw}" read as ${name} (${where})`);
    const id = byName.get(name);
    if (id === undefined) report.error('wc-teams', `No World Cup team is named "${raw}" (${where})`);
    return id;
  };
  const parsed = parseWorldCups(rows).sort((a, b) => a.season - b.season);
  const summaries: SummaryFile[] = [];
  for (const r of parsed) {
    if (r.champion === null) continue;
    const where = `S${r.season}`;
    const champion = SHEET_TEAM_ALIASES[r.champion] ?? r.champion;
    const runnerUp = r.runnerUp === null ? null : SHEET_TEAM_ALIASES[r.runnerUp] ?? r.runnerUp;
    const built: Champion = { title: 'World Cup Champion', champion, runnerUp, score: null, finalsMvp: r.mvp === null ? null : resolve(r.mvp, `${where} Tournament MVP`) };
    const id = teamId(r.champion, `${where} champion`);
    if (id !== undefined) built.teamId = id;
    if (r.runnerUp !== null) {
      const rid = teamId(r.runnerUp, `${where} runner-up`);
      if (rid !== undefined) built.runnerUpId = rid;
    }
    const old = ctx.existing.get(r.season);
    const entry = mergeChampion(built, old?.champions.find(c => c.title === built.title));
    summaries.push({ ...(old ?? {}), league: 'fbawc', season: r.season, locked: true, host: r.country, champions: [entry, ...(old?.champions.filter(c => c.title !== built.title) ?? [])] });
  }
  const hosts: WcHostsFile = { hosts: parsed.map(r => ({ season: r.season, city: r.city, country: r.country })) };
  const teams: TeamsFile = { ...ctx.teams, teams: ctx.teams.teams.map(t => (t.teamId in WC_FLAGS ? { ...t, flag: WC_FLAGS[t.teamId] } : t)) };
  return { summaries, hosts, teams };
}
