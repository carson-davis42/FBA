import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { PastSeries, PlayersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { buildCareers, parseAwardsByPlayer, parseLeaguePpg } from './careers';
import { mergeDuplicates } from './duplicates';
import { buildHistory } from './history';
import type { Report } from './report';
import { parseAllFba, parseAwards, parseBios, parseChampionships, parsePastStandings } from './sheets/history';

export interface HistorySources {
  /** Every `*.json` under the data folder, by path relative to it. */
  docs: Map<string, unknown>;
  /** Main-sheet tabs by name: Championships, Awards, All-FBA Teams, Players and FBA Awards won by Player. */
  tabs: Record<string, string[][]>;
  /** Past-standings tabs by name (`S71`...). */
  standingTabs: Record<string, string[][]>;
  /** The contents of FBA/League-Points-Stats.txt. */
  ppgText: string;
  brackets: { season: number; rounds: number; series: PastSeries[] }[];
}

const AWARDS_TAB = 'Awards, Conference Titles, & AS';
const TAB11 = 'FBA Awards won by Player';
const summaryPath = (n: number): string => `leagues/fba/S${n}/summary.json`;

/** The history import as a pure plan: the files to write, in order (a later write of a path replaces an earlier one), or [] on errors. */
export function planHistoryImport(src: HistorySources, report: Report): [string, unknown][] {
  const docs = new Map(src.docs);
  const bioRows = parseBios(src.tabs['Players']);

  const merged = mergeDuplicates(docs, bioRows, report);
  for (const [rel, doc] of merged) docs.set(rel, doc);

  const players = docs.get('players.json') as PlayersFile;
  const existing = new Map<number, SummaryFile>();
  for (let n = 1; n <= 78; n++) {
    const doc = docs.get(summaryPath(n));
    if (doc) existing.set(n, doc as SummaryFile);
  }
  const standings = new Map<number, ReturnType<typeof parsePastStandings>>();
  for (const [name, rows] of Object.entries(src.standingTabs)) {
    const m = /^S(\d+)$/.exec(name);
    if (m) standings.set(Number(m[1]), parsePastStandings(rows));
  }
  const teamsOf = (rel: string) => (docs.get(rel) as TeamsFile | undefined)?.teams ?? [];
  const out = buildHistory({
    players,
    teams: [...teamsOf('leagues/fba/teams.json'), ...teamsOf('leagues/fbad2/teams.json')],
    existing,
    champs: parseChampionships(src.tabs['Championships']),
    awards: parseAwards(src.tabs[AWARDS_TAB]),
    allFba: parseAllFba(src.tabs['All-FBA Teams']),
    standings,
    bios: bioRows,
    brackets: src.brackets,
  }, report);
  report.info('players', `Added ${Object.keys(out.players.players).length - Object.keys(players.players).length} players`);

  const careers = buildCareers({
    players: out.players,
    bios: out.bios,
    summaries: out.summaries,
    tab11: parseAwardsByPlayer(src.tabs[TAB11]),
    ppg: parseLeaguePpg(src.ppgText),
  }, report);

  const playersCheck = schemaForPath('players.json')!.safeParse(out.players);
  if (!playersCheck.success) report.error('schema', `players.json: ${playersCheck.error.issues.slice(0, 3).map(x => `${x.path.join('.')} ${x.message}`).join('; ')}`);
  if (report.hasErrors) return [];

  const files = new Map<string, unknown>(merged);
  files.set('players.json', out.players);
  files.set('leagues/fba/playerBios.json', out.bios);
  for (const s of out.summaries) files.set(summaryPath(s.season), s.season === 78 && careers.s78 ? careers.s78 : s);
  files.set('leagues/fba/awardCounts.json', careers.awardCounts);
  return [...files];
}
