import { schemaForPath } from '../engine/shared/schemaRegistry';
import { JC_EARLY_ERA_LAST_SEASON, type JcSchoolHistoryFile, type TeamsFile } from '../engine/shared/types';
import { JC_LAST_SEASON } from './jcHistory';
import { normName } from './history';
import type { Report } from './report';
import type { JcChampionRow } from './sheets/jcHistory';
import { parseSchoolTab } from './sheets/jcSchools';

/** Sheet school spellings mapped to the `teams.json` spelling (compared with `normName`). */
export const SHEET_SCHOOL_NAME_ALIASES: Record<string, string> = { 'Deleware State': 'Delaware State', 'SE Missouri State': 'Southeastern Missouri State' };
/** Each conference tab's name mapped to its `teams.json` group code. */
const TAB_CONFERENCE: Record<string, string> = {
  'big 12': 'B12', acc: 'ACC', 'big east': 'BE', sec: 'SEC', 'big ten': 'B10', american: 'AAC', 'pac-12': 'P12', 'atlantic 10': 'A10',
  patriot: 'PAT', colonial: 'COL', horizon: 'HOR', ivy: 'IVY', southern: 'SOCON', 'sun belt': 'SUN', 'big sky': 'SKY',
  'mountain west': 'MWC', 'ohio valley': 'OVC', nec: 'NEC',
};

/**
 * Builds `leagues/fbajc/schoolHistory.json` from the 18 conference tabs of "FBA JC School History" (S1-S78 only). `mmWins` stays null:
 * the "Total MM Wins All-Time" tab is only partly filled in, so it isn't read. When the national champions are given, each school's
 * champion seasons are checked against them and every disagreement is a warning.
 */
export function buildSchoolHistory(tabs: Record<string, string[][]>, teams: TeamsFile, nationalChampions: JcChampionRow[] | null, report: Report): JcSchoolHistoryFile {
  const byName = new Map(teams.teams.map(t => [normName(t.name), t]));
  const groups = new Set(teams.teams.map(t => t.group));
  const resolve = (raw: string): { teamId: string; group: string | null } | null => {
    const name = SHEET_SCHOOL_NAME_ALIASES[raw] ?? raw;
    const t = byName.get(normName(name));
    return t ? { teamId: t.teamId, group: t.group } : null;
  };
  const schools: JcSchoolHistoryFile['schools'] = [];
  for (const [tab, rows] of Object.entries(tabs)) {
    const tabGroup = TAB_CONFERENCE[tab.trim().toLowerCase()];
    if (!tabGroup) report.error('jc-schools', `Unknown conference tab "${tab}"`);
    for (const p of parseSchoolTab(rows, report)) {
      const t = resolve(p.name);
      if (!t) { report.error('jc-schools', `No FBAJC team is named "${p.name}" (tab ${tab.trim()})`); continue; }
      if (p.name !== (SHEET_SCHOOL_NAME_ALIASES[p.name] ?? p.name)) report.info('jc-schools', `Sheet school "${p.name}" read as ${SHEET_SCHOOL_NAME_ALIASES[p.name]}`);
      if (tabGroup && t.group !== tabGroup) report.warn('jc-schools', `${p.name} is on the ${tab.trim()} tab but is in ${t.group} in teams.json`);
      const clip = <T extends { season: number }>(list: T[], what: string): T[] => {
        const kept = list.filter(x => x.season <= JC_LAST_SEASON);
        if (kept.length < list.length) report.warn('jc-schools', `${p.name} ${what}: seasons after S${JC_LAST_SEASON} were skipped`);
        return kept;
      };
      const seasons = (list: number[], what: string): number[] => clip(list.map(season => ({ season })), what).map(x => x.season);
      const conf = (list: { season: number; conf: string | null }[], what: string) => {
        for (const x of list) if (x.conf !== null && !groups.has(x.conf)) report.error('jc-schools', `${p.name} ${what} S${x.season}: "${x.conf}" is not a conference code`);
        return clip(list, what);
      };
      const mm = {
        app: seasons(p.mm.app, 'MM App.'), sweet16: seasons(p.mm.sweet16, 'Sweet 16'), elite8: seasons(p.mm.elite8, 'Elite 8'),
        final4: seasons(p.mm.final4, 'Final Four'), titleGame: seasons(p.mm.titleGame, 'NC app.'), champion: seasons(p.mm.champion, 'National Champions'),
      };
      // Reaching a round means reaching the ones before it: a season listed in a deeper round but not the shallower one is added, and reported so the sheet can be fixed.
      const order = ['app', 'sweet16', 'elite8', 'final4', 'titleGame', 'champion'] as const;
      const label = { app: 'MM App.', sweet16: 'Sweet 16', elite8: 'Elite 8', final4: 'Final Four', titleGame: 'NC app.', champion: 'National Champions' };
      for (let i = order.length - 1; i > 0; i--) {
        for (const season of mm[order[i]]) {
          if (season <= JC_EARLY_ERA_LAST_SEASON || mm[order[i - 1]].includes(season)) continue;
          mm[order[i - 1]] = [...mm[order[i - 1]], season].sort((x, y) => x - y);
          report.warn('jc-schools', `${p.name}: S${season} is listed under ${label[order[i]]} but not ${label[order[i - 1]]}; added to ${label[order[i - 1]]}`);
        }
      }
      schools.push({
        teamId: t.teamId,
        mm,
        rsChampion: conf(p.rsChampion, 'Conf RS Champions'),
        confTournament: conf(p.confTournament, 'Conf TOUR Champions'),
        mmWins: null,
      });
    }
  }
  if (nationalChampions) {
    const owner = new Map<number, string>();
    for (const s of schools) for (const season of s.mm.champion) owner.set(season, s.teamId);
    const expected = new Map<number, string>();
    for (const c of nationalChampions) {
      const t = resolve(c.champion);
      if (t && c.season <= JC_LAST_SEASON) expected.set(c.season, t.teamId);
    }
    for (const [season, id] of expected) {
      const got = owner.get(season);
      if (got !== id) report.warn('jc-schools-check', `S${season}: the national champions tab says ${id}, the school history says ${got ?? 'nobody'}`);
    }
    for (const [season, id] of owner) if (!expected.has(season)) report.warn('jc-schools-check', `S${season}: the school history gives ${id} a title the national champions tab does not list`);
  }
  return { league: 'fbajc', throughSeason: JC_LAST_SEASON, schools };
}

export interface JcSchoolsInput { teams: TeamsFile; tabs: Record<string, string[][]>; nationalChampions: JcChampionRow[] | null }

/** Builds `schoolHistory.json` and checks it against its schema; `docs` is empty when anything failed. */
export function planJcSchools(input: JcSchoolsInput, report: Report): { docs: [string, unknown][]; problems: string[] } {
  const file = buildSchoolHistory(input.tabs, input.teams, input.nationalChampions, report);
  if (report.hasErrors) return { docs: [], problems: [] };
  const rel = 'leagues/fbajc/schoolHistory.json';
  const r = schemaForPath(rel)?.safeParse(file);
  if (r?.success) return { docs: [[rel, file]], problems: [] };
  return { docs: [], problems: [`${rel}: ${r ? r.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : 'no schema'}`] };
}
