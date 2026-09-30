import { groupLabel } from '../engine/shared/leagues';
import type { AwardEntry, Champion, D2DraftDraft, D2DraftHistoryFile, D2LeagueHistoryFile, D2TeamLeagueHistory, PlayersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { nameResolver } from './history';
import type { Report } from './report';
import {
  d2DraftTabSeason, parseAwardsTab, parseD2DraftTab, parseIntlChampionships, parseLeagueChampionships, parseTeamLeagueHistory,
  type AwardsRow, type TitleRow,
} from './sheets/d2History';

export const D2_SHEET = '16oZgCRFdQLF4NVOecz5lhS_xJXI4YTh-NDDM7gQCXAc';
export const D2_TABS = { leagues: 'Team League History', intl: 'D2 International Championships(', league: 'D2 League Championships(S68-pre', awardsEarly: 'D2 Awards(S53-S67)', awardsLate: 'D2 Awards(S68-pres.)' } as const;

export interface D2HistoryCtx { players: PlayersFile; teams: TeamsFile; existing: Map<number, SummaryFile> }

const LEAGUES = ['PL', 'WL', 'UL', 'IL'];

/** Sheet misspellings of D2 team names. */
const SHEET_TEAM_ALIASES: Record<string, string> = { Luxemboug: 'Luxembourg' };
/** Names shared by two players: every D2 sheet mention of Nadeem Akers (S72 draft, S74 IL Series MVP, S75 UL MVP and Series MVP, all Osaka) is the S50-born one. */
const PLAYER_OVERRIDES: Record<string, string> = { 'Nadeem Akers': 'p00040' };

function teamIdLookup(teams: TeamsFile, report: Report): (name: string) => string | undefined {
  const byName = new Map(teams.teams.map(t => [t.name, t.teamId]));
  const seen = new Set<string>();
  return name => {
    const id = byName.get(SHEET_TEAM_ALIASES[name] ?? name);
    if (id === undefined && !seen.has(name)) {
      seen.add(name);
      report.info('d2-teams', `No D2 team is named "${name}"`);
    }
    return id;
  };
}

function titleOf(row: TitleRow): string {
  if (row.group === 'D2') return `D2 International Champion${row.half ? ` (${row.half})` : ''}`;
  return `${groupLabel('fbad2', row.group)} Champion`;
}

export function buildLeagueHistory(rows: string[][], teams: TeamsFile, report: Report): D2LeagueHistoryFile {
  const ids = new Map(teams.teams.map(t => [t.name, t.teamId]));
  const out: D2TeamLeagueHistory[] = [];
  const seen = new Set<string>();
  for (const row of parseTeamLeagueHistory(rows)) {
    const teamId = ids.get(row.name);
    if (teamId === undefined) {
      report.error('d2-leagues', `Team League History names "${row.name}", which isn't in the D2 teams.json`);
      continue;
    }
    seen.add(teamId);
    out.push({ teamId, founded: row.founded, spells: row.spells });
  }
  for (const t of teams.teams) {
    if (!seen.has(t.teamId)) report.error('d2-leagues', `${t.name} (${t.teamId}) is missing from the Team League History tab`);
  }
  out.sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  return { teams: out };
}

/** The sheet wins for seasons it covers: it overwrites group, teamId, runnerUpId, finalsMvp, awards and rsChampions; the existing champion, runnerUp and score text is kept. */
function mergeSummary(built: SummaryFile, existing: SummaryFile | undefined): SummaryFile {
  if (!existing) return built;
  const champions: Champion[] = existing.champions.map(c => {
    const b = built.champions.find(x => x.title === c.title);
    if (!b) return c;
    const merged: Champion = { ...c };
    if (b.group !== undefined) merged.group = b.group;
    if (b.teamId !== undefined) merged.teamId = b.teamId;
    if (b.runnerUpId !== undefined) merged.runnerUpId = b.runnerUpId;
    if (b.finalsMvp !== undefined) merged.finalsMvp = b.finalsMvp;
    return merged;
  });
  for (const b of built.champions) if (!existing.champions.some(c => c.title === b.title)) champions.push(b);
  const out: SummaryFile = { ...existing, champions };
  if (built.awards !== undefined) out.awards = built.awards; else delete out.awards;
  if (built.rsChampions !== undefined) out.rsChampions = built.rsChampions; else delete out.rsChampions;
  return out;
}

export function buildD2History(
  d2Tabs: Record<string, string[][]>, draftTabs: Record<string, string[][]>, ctx: D2HistoryCtx, report: Report,
): { summaries: SummaryFile[]; leagueHistory: D2LeagueHistoryFile; drafts: D2DraftHistoryFile } {
  const teamId = teamIdLookup(ctx.teams, report);
  const resolveName = nameResolver(ctx.players, report, 'd2-history');
  const resolve = (name: string, where: string): string | null =>
    (PLAYER_OVERRIDES[name] && ctx.players.players[PLAYER_OVERRIDES[name]] ? PLAYER_OVERRIDES[name] : resolveName(name, where));

  const titles: TitleRow[] = [
    ...parseIntlChampionships(d2Tabs[D2_TABS.intl] ?? []),
    ...parseLeagueChampionships(d2Tabs[D2_TABS.league] ?? []),
  ];
  const awardRows: AwardsRow[] = [
    ...parseAwardsTab(d2Tabs[D2_TABS.awardsEarly] ?? []),
    ...parseAwardsTab(d2Tabs[D2_TABS.awardsLate] ?? []),
  ];
  const seasons = [...new Set([...titles.map(t => t.season), ...awardRows.map(a => a.season)])].sort((a, b) => a - b);

  const summaries: SummaryFile[] = seasons.map(season => {
    const champions: Champion[] = titles.filter(t => t.season === season).map(t => {
      const c: Champion = {
        title: titleOf(t), champion: t.champion, runnerUp: t.runnerUp, score: null, group: t.group,
        finalsMvp: t.seriesMvp === null ? null : resolve(t.seriesMvp, `S${season} ${t.group} Series MVP`),
      };
      const id = teamId(t.champion);
      if (id !== undefined) c.teamId = id;
      if (t.runnerUp !== null) {
        const rid = teamId(t.runnerUp);
        if (rid !== undefined) c.runnerUpId = rid;
      }
      return c;
    });
    const awards: AwardEntry[] = [];
    const rs = new Map<string, string[]>();
    for (const row of awardRows.filter(a => a.season === season)) {
      for (const m of row.mvps) {
        const playerId = resolve(m.cell.name, `S${season} ${m.award}`);
        if (playerId === null) continue;
        awards.push({ award: m.award, playerId, teamId: teamId(m.cell.team) ?? (SHEET_TEAM_ALIASES[m.cell.team] ?? m.cell.team) });
      }
      for (const r of row.rsChampions) {
        const list = rs.get(r.group) ?? [];
        for (const raw of r.teams) { const t = SHEET_TEAM_ALIASES[raw] ?? raw; if (!list.includes(t)) list.push(t); }
        rs.set(r.group, list);
      }
    }
    const built: SummaryFile = { league: 'fbad2', season, locked: true, host: null, champions };
    if (awards.length) built.awards = awards;
    if (rs.size) built.rsChampions = [...rs].map(([group, teams]) => ({ group, teams }));
    return mergeSummary(built, ctx.existing.get(season));
  });

  const drafts: D2DraftDraft[] = [];
  for (const [tab, rows] of Object.entries(draftTabs)) {
    const season = d2DraftTabSeason(tab);
    if (season === null) continue;
    const picks = parseD2DraftTab(rows).map((r, i) => ({
      pick: i + 1, teamId: teamId(r.team) ?? null, teamName: r.team, name: r.name,
      playerId: resolve(r.name, `S${season} D2 ${r.name}`), pos: r.pos, age: r.age, rating: r.rating,
    }));
    drafts.push({ season, picks });
  }
  drafts.sort((a, b) => a.season - b.season);

  return { summaries, leagueHistory: buildLeagueHistory(d2Tabs[D2_TABS.leagues] ?? [], ctx.teams, report), drafts: { drafts } };
}

export function d2LeagueMoves(teams: TeamsFile, history: D2LeagueHistoryFile):
  { next: TeamsFile; moves: { teamId: string; name: string; from: string; to: string }[]; problems: string[] } {
  const problems: string[] = [];
  const current = new Map<string, string>();
  const byId = new Map(teams.teams.map(t => [t.teamId, t]));
  for (const h of history.teams) {
    const team = byId.get(h.teamId);
    if (!team) { problems.push(`${h.teamId} is in the league history but not in teams.json`); continue; }
    const open = h.spells.find(s => s.to === null);
    if (!open || !LEAGUES.includes(open.group)) { problems.push(`${team.name} has no open PL/WL/UL/IL spell`); continue; }
    current.set(h.teamId, open.group);
  }
  for (const t of teams.teams) {
    if (!history.teams.some(h => h.teamId === t.teamId)) problems.push(`${t.name} (${t.teamId}) has no league history`);
  }
  for (const g of LEAGUES) {
    const n = [...current.values()].filter(x => x === g).length;
    if (n !== 16) problems.push(`${groupLabel('fbad2', g)} would have ${n} teams, not 16`);
  }
  const moves: { teamId: string; name: string; from: string; to: string }[] = [];
  const next: TeamsFile = {
    ...teams,
    teams: teams.teams.map(t => {
      const to = current.get(t.teamId);
      if (to === undefined || to === t.group) return t;
      moves.push({ teamId: t.teamId, name: t.name, from: t.group ?? '', to });
      return { ...t, group: to };
    }),
  };
  moves.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { next, moves, problems };
}
