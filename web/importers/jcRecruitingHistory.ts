import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { JcRecruitingHistoryFile, PlayersFile, TeamsFile } from '../engine/shared/types';
import { normName } from './history';
import { JC_LAST_SEASON } from './jcHistory';
import { SHEET_SCHOOL_NAME_ALIASES } from './jcSchools';
import type { Report } from './report';
import { parseRecruitingHistory, parseTransferHistory } from './sheets/jcRecruitingHistory';

export const JC_RECRUITING_TABS = { recruiting: 'FBA JC Recruiting', portal: 'FBA JC Transfer Portal' } as const;

export interface JcRecruitingInput { players: PlayersFile; teams: TeamsFile; tabs: Record<string, string[][]> }

/**
 * Builds `leagues/fbajc/recruitingHistory.json` from the recruiting and transfer portal tabs, S78 and earlier (the current class is the live board).
 * Schools are matched to `teams.json` by name and players to `players.json` by an unambiguous name; what doesn't match keeps the sheet's text.
 */
export function buildRecruitingHistory(input: JcRecruitingInput, report: Report): JcRecruitingHistoryFile {
  const byName = new Map(input.teams.teams.map(t => [normName(t.name), t.teamId]));
  const school = (raw: string | null): { school: string | null; teamId: string | null } => {
    if (!raw) return { school: null, teamId: null };
    const name = SHEET_SCHOOL_NAME_ALIASES[raw] ?? raw;
    const teamId = byName.get(normName(name)) ?? null;
    if (!teamId) report.warn('jc-recruiting', `No FBAJC team is named "${raw}"`);
    return { school: name, teamId };
  };
  const ids = new Map<string, string[]>();
  for (const [id, p] of Object.entries(input.players.players)) if (p.name) ids.set(normName(p.name), [...(ids.get(normName(p.name)) ?? []), id]);
  const unmatched = new Set<string>();
  const player = (name: string): string | null => {
    const found = ids.get(normName(name));
    if (found?.length === 1) return found[0];
    unmatched.add(name);
    return null;
  };

  const recruiting = parseRecruitingHistory(input.tabs[JC_RECRUITING_TABS.recruiting] ?? []).filter(s => s.season <= JC_LAST_SEASON);
  const portal = parseTransferHistory(input.tabs[JC_RECRUITING_TABS.portal] ?? []).filter(s => s.season <= JC_LAST_SEASON);
  const seasons = [...new Set([...recruiting.map(s => s.season), ...portal.map(s => s.season)])].sort((a, b) => a - b);
  const classes = seasons.map(season => ({
    season,
    recruits: (recruiting.find(s => s.season === season)?.rows ?? []).map(r => {
      const sc = school(r.school);
      return { rank: r.rank, stars: r.stars, pos: r.pos, name: r.name, playerId: player(r.name), rating: r.rating, consensus: r.consensus, school: sc.school, teamId: sc.teamId };
    }),
    portal: (portal.find(s => s.season === season)?.rows ?? []).map(r => {
      const from = school(r.from), to = school(r.to);
      return { rank: r.rank, pos: r.pos, name: r.name, playerId: player(r.name), rating: r.rating, fromSchool: from.school, fromTeamId: from.teamId, toSchool: to.school, toTeamId: to.teamId };
    }),
  }));
  report.info('jc-recruiting', `${unmatched.size} names matched no single player; they stay as plain text`);
  return { league: 'fbajc', throughSeason: JC_LAST_SEASON, classes };
}

export function planJcRecruitingHistory(input: JcRecruitingInput, report: Report): { docs: [string, unknown][]; problems: string[] } {
  const file = buildRecruitingHistory(input, report);
  if (report.hasErrors) return { docs: [], problems: [] };
  const rel = 'leagues/fbajc/recruitingHistory.json';
  const r = schemaForPath(rel)?.safeParse(file);
  if (r?.success) return { docs: [[rel, file]], problems: [] };
  return { docs: [], problems: [`${rel}: ${r ? r.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : 'no schema'}`] };
}
