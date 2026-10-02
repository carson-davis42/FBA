import { AWARD_LABEL } from '../awards/races';
import type { AwardEntry, D2DraftHistoryFile, D2LeagueHistoryFile, SummaryFile, Team } from '../shared/types';

export const D2_MVP_AWARDS = ['MVP-D2', 'MVP-AM', 'MVP-EW', 'MVP-EE', 'MVP-ES', 'MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL'] as const;
/** League history covers seasons up to the S79 layout. */
export const D2_IMPORT_THROUGH = 79;
const RS_GROUPS = ['PL', 'WL', 'UL', 'IL'];

export interface D2TitleRow {
  season: number; title: string; group: string | null; champion: string; teamId: string | null;
  runnerUp: string | null; runnerUpId: string | null; score: string | null; seriesMvp: string | null;
}

/** Newest season first, then champions order. */
export function d2TitleRows(seasons: SummaryFile[]): D2TitleRow[] {
  return [...seasons].sort((a, b) => b.season - a.season).flatMap(s => s.champions.map(c => ({
    season: s.season, title: c.title, group: c.group ?? null, champion: c.champion, teamId: c.teamId ?? null,
    runnerUp: c.runnerUp, runnerUpId: c.runnerUpId ?? null, score: c.score, seriesMvp: c.finalsMvp ?? null,
  })));
}

/** The regular-season champions: the imported field, else the rank-1 standings rows of each league. */
export function rsChampionsOf(s: SummaryFile): { group: string; teams: string[] }[] {
  if (s.rsChampions) return s.rsChampions;
  const out: { group: string; teams: string[] }[] = [];
  for (const group of RS_GROUPS) {
    const teams = (s.standings ?? []).filter(r => r.group === group && r.rank === 1).map(r => r.name);
    if (teams.length) out.push({ group, teams });
  }
  return out;
}

/** The season's MVP awards in D2_MVP_AWARDS order (duplicates kept). */
export function d2Mvps(s: SummaryFile): AwardEntry[] {
  const order = (a: AwardEntry) => (D2_MVP_AWARDS as readonly string[]).indexOf(a.award);
  return (s.awards ?? []).filter(a => order(a) >= 0).map((a, i) => ({ a, i })).sort((x, y) => order(x.a) - order(y.a) || x.i - y.i).map(x => x.a);
}

export function d2MvpCounts(seasons: SummaryFile[]): { playerId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of seasons) for (const a of d2Mvps(s)) counts.set(a.playerId, (counts.get(a.playerId) ?? 0) + 1);
  return [...counts].map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count || a.playerId.localeCompare(b.playerId));
}

export interface PathSpell { group: string; from: number; to: number | null }

/** The last spell covering the season (neighbouring spells can share an edge season). */
export function leagueInSeason(history: D2LeagueHistoryFile | null, teamId: string, season: number): string | null {
  const spells = history?.teams.find(t => t.teamId === teamId)?.spells ?? [];
  let found: string | null = null;
  for (const sp of spells) if (sp.from <= season && (sp.to === null || season <= sp.to)) found = sp.group;
  return found;
}

export function leaguePath(
  history: D2LeagueHistoryFile | null, summaries: SummaryFile[], teamId: string, current?: { season: number; group: string },
): PathSpell[] {
  const spells: PathSpell[] = (history?.teams.find(t => t.teamId === teamId)?.spells ?? []).map(s => ({ group: s.group, from: s.from, to: s.to }));
  const app: PathSpell[] = [];
  for (const s of [...summaries].sort((a, b) => a.season - b.season)) {
    if (s.season <= D2_IMPORT_THROUGH) continue;
    const r = s.standings?.find(x => x.teamId === teamId);
    if (r) app.push({ group: r.group, from: s.season, to: s.season });
  }
  if (current) app.push({ group: current.group, from: current.season, to: current.season });
  if (!spells.length && !app.length) return [];
  if (app.length && spells.length && spells[spells.length - 1].to === null) spells[spells.length - 1].to = D2_IMPORT_THROUGH;
  const merged: PathSpell[] = [];
  for (const sp of [...spells, ...app]) {
    const prev = merged[merged.length - 1];
    if (prev && prev.group === sp.group && (prev.to === null || sp.from <= prev.to + 1)) {
      prev.to = sp.to === null || prev.to === null ? sp.to : Math.max(prev.to, sp.to);
    } else merged.push({ ...sp });
  }
  if (app.length) merged[merged.length - 1].to = null;
  return merged;
}

export interface D2TeamCase {
  titles: { season: number; title: string; group: string | null }[];
  finalsLost: { season: number; title: string }[];
  rsTitles: { season: number; group: string }[];
  mvps: { season: number; award: string; playerId: string }[];
  seriesMvps: { season: number; title: string; playerId: string }[];
  picks: { season: number; pick: number; playerId: string | null; name: string }[];
}

export function d2TeamCase(team: Team, seasons: SummaryFile[], drafts: D2DraftHistoryFile | null): D2TeamCase {
  const out: D2TeamCase = { titles: [], finalsLost: [], rsTitles: [], mvps: [], seriesMvps: [], picks: [] };
  for (const s of [...seasons].sort((a, b) => a.season - b.season)) {
    for (const c of s.champions) {
      if (c.teamId === team.teamId || c.champion === team.name) {
        out.titles.push({ season: s.season, title: c.title, group: c.group ?? null });
        if (c.finalsMvp) out.seriesMvps.push({ season: s.season, title: c.title, playerId: c.finalsMvp });
      } else if (c.runnerUpId === team.teamId || c.runnerUp === team.name) out.finalsLost.push({ season: s.season, title: c.title });
    }
    for (const rc of rsChampionsOf(s)) if (rc.teams.includes(team.name)) out.rsTitles.push({ season: s.season, group: rc.group });
    for (const a of d2Mvps(s)) if (a.teamId === team.teamId || a.teamId === team.name) out.mvps.push({ season: s.season, award: a.award, playerId: a.playerId });
  }
  for (const d of [...(drafts?.drafts ?? [])].sort((a, b) => a.season - b.season)) {
    for (const p of d.picks) if (p.teamId === team.teamId || (p.teamId === null && p.teamName === team.name)) {
      out.picks.push({ season: d.season, pick: p.pick, playerId: p.playerId, name: p.name });
    }
  }
  return out;
}

/** `team` is the D2 team the text names in parentheses, so a page can link it. */
export interface D2Honour { season: number; text: string; team?: { id: string; name: string } }

/** A player's D2 honours, oldest first. */
export function d2PlayerHonours(playerId: string, seasons: SummaryFile[], drafts: D2DraftHistoryFile | null, teams: Team[]): D2Honour[] {
  const nameOf = (id: string | null, fallback: string) => (id ? teams.find(t => t.teamId === id)?.name : undefined) ?? teams.find(t => t.teamId === fallback)?.name ?? fallback;
  const teamOf = (id: string | null, fallback: string): D2Honour['team'] => {
    const t = (id ? teams.find(x => x.teamId === id) : undefined) ?? teams.find(x => x.teamId === fallback);
    return t ? { id: t.teamId, name: t.name } : undefined;
  };
  const out: D2Honour[] = [];
  for (const d of drafts?.drafts ?? []) {
    for (const p of d.picks) if (p.playerId === playerId) out.push({ season: d.season, text: `D2 draft: pick ${p.pick} (${nameOf(p.teamId, p.teamName)})`, team: teamOf(p.teamId, p.teamName) });
  }
  for (const s of seasons) {
    for (const a of d2Mvps(s)) if (a.playerId === playerId) out.push({ season: s.season, text: `${AWARD_LABEL[a.award]} (${nameOf(null, a.teamId)})`, team: teamOf(null, a.teamId) });
    for (const c of s.champions) if (c.finalsMvp === playerId) out.push({ season: s.season, text: `Series MVP, ${c.title}` });
  }
  return out.map((h, i) => ({ h, i })).sort((a, b) => a.h.season - b.h.season || a.i - b.i).map(x => x.h);
}
