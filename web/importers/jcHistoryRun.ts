import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { PlayersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { buildJcHistory } from './jcHistory';
import type { Report } from './report';
import {
  parseAllAmericans, parseConferenceAwards, parseNationalAwards, parseNationalChampions, parseNitChampions,
  parsePreseason, parseRegularSeasonChampions, parseTournamentChampions,
} from './sheets/jcHistory';

/** The tabs of the "FBAJC" workbook that `--jc-history` reads. `rs` is longer than Excel's 31-character tab limit: the xlsx export cuts it. */
export const JC_HISTORY_TABS = {
  champions: 'National Championship History',
  nit: 'NIT Championship History',
  awards: 'FBAJC National Awards History',
  confAwards: 'Conference Awards History',
  rs: 'Conference Regular Season Champions',
  tour: 'Conference Tournament Champions',
  pre: 'Preseason Tournament Champions',
} as const;

export interface JcHistoryInput { players: PlayersFile; teams: TeamsFile; existing: Map<number, SummaryFile>; tabs: Record<string, string[][]> }

/** The tab's rows by its full name or its 31-character Excel name; a missing tab is a report error. */
function rowsOf(tabs: Record<string, string[][]>, name: string, report: Report): string[][] {
  const rows = tabs[name] ?? tabs[name.slice(0, 31)];
  if (!rows) report.error('jc-history', `Tab "${name}" not found in the FBAJC workbook`);
  return rows ?? [];
}

/** Builds every season summary S1–S78 from the workbook tabs and checks each against its schema. `docs` is empty when anything failed, so nothing is half-written. */
export function planJcHistory(input: JcHistoryInput, report: Report): { docs: [string, unknown][]; problems: string[] } {
  const t = (name: string) => rowsOf(input.tabs, name, report);
  const parsed = {
    champions: parseNationalChampions(t(JC_HISTORY_TABS.champions), report),
    nit: parseNitChampions(t(JC_HISTORY_TABS.nit), report),
    awards: parseNationalAwards(t(JC_HISTORY_TABS.awards), report),
    allAmericans: parseAllAmericans(t(JC_HISTORY_TABS.awards)),
    confAwards: parseConferenceAwards(t(JC_HISTORY_TABS.confAwards)),
    rsChampions: parseRegularSeasonChampions(t(JC_HISTORY_TABS.rs)),
    tourChampions: parseTournamentChampions(t(JC_HISTORY_TABS.tour)),
    preseason: parsePreseason(t(JC_HISTORY_TABS.pre)),
  };
  if (report.hasErrors) return { docs: [], problems: [] };
  const summaries = buildJcHistory(parsed, { players: input.players, teams: input.teams, existing: input.existing }, report);
  if (report.hasErrors) return { docs: [], problems: [] };
  const docs: [string, unknown][] = summaries.map(s => [`leagues/fbajc/S${s.season}/summary.json`, s]);
  const problems = docs.flatMap(([rel, doc]) => {
    const r = schemaForPath(rel)?.safeParse(doc);
    return r?.success ? [] : [`${rel}: ${r ? r.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : 'no schema'}`];
  });
  return problems.length ? { docs: [], problems } : { docs, problems };
}
