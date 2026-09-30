import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CalendarFile, Franchise, FranchisesFile, HallOfFameFile, LogoManifest, MetaFile, PlayerBiosFile, PlayersFile, RecruitingFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile } from '../engine/shared/types';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import { assemble } from './assemble';
import { buildDraftHistory } from './draftHistory';
import { buildPastTransactions } from './pastTransactions';
import { planHistoryImport } from './historyRun';
import { buildLogoManifest, diffLogoManifests } from './logoManifest';
import { Report } from './report';
import { assembleRefresh } from './refresh';
import { applyNameFixes, planNameFixes } from './fixNames';
import { buildClassImport, previousImportProblem } from './recruitingClassImport';
import { draftTabKind } from './sheets/drafts';
import { buildEvents, parseEventsTab } from './sheets/events';
import { parseFranchiseTab } from './sheets/franchises';
import { parseHallOfFameTab } from './sheets/hallOfFame';
import { parseTeamTabCounts } from './sheets/teamTabs';
import { TROPHY_AWARDS, trophyCase } from '../engine/history/trophies';
import { parseCalendarTab, parseD2ReservesTab, parseD2RosterTab, parseFbaRosterTab, parseFreeAgentsTab, parsePickRows } from './sheets/parsers';
import { parsePlayersTab } from './sheets/playersTab';
import { parseClassSection } from './sheets/recruitingClass';
import { parseDataArg } from './dataArg';
import { downloadWorkbook, readTabs, readUnderlines } from './sheets/xlsx';
import { parseBracketFile, parseD2Playoffs, parseFbaPlayoffs, parseFbaResults } from './txt/archives';
import { parseRosterTxt } from './txt/rosters';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const DATA = path.join(WEB, 'data');
const CACHE = path.join(WEB, 'importers', '.cache');
const REPORT = path.join(WEB, 'importers', 'import-report.md');
const SHEETS = {
  rosters: '1f5j4rhYDK7HB8j9Zz-JHDrhRqEYDSxkgfwQcuqP-A2w',
  main: '1p5oLB9lJvsVKIyaiEOOg9luPxGBdY3yy5SOGq7edMUM',
  draft: '1e3YJEurdTk5y2XKHQcgttCbknZZsJOB8RhR10_gG1W4',
  collegeHistory: '1jgB8AI5dMjSXuSNQm3szoeRF5rIYcgmPXin-idAgE84',
  pastStandings: '1FuPd67Vj8L4Zy4J53Z2jZzw_oqEa-1S5Lzztwq-NDpI',
  teamHistory: '1_oz7ULZMsaFInj-ncqs8qUm_5UBBNffJM_x9_ZOvQFU',
};

const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(DATA, ...rel.split('/')), 'utf8')) as T;

/** The data folder to write: web/data, or the folder given with --data <dir> (use a scratch copy for checks). */
function dataDir(): string {
  const r = parseDataArg(process.argv, DATA);
  if ('error' in r) {
    console.error(r.error);
    process.exit(1);
  }
  return r.dir;
}

/** The folder given with --data <dir>; exits when absent. Import modes that write history need an explicit folder. */
function requireDataDir(flag: string): string {
  const r = parseDataArg(process.argv, '');
  if ('error' in r || !r.dir) {
    console.error(`${flag} needs --data <dir>: the data folder to read and write (use a scratch copy first).`);
    process.exit(1);
  }
  return r.dir;
}
const readDataJson = <T>(dir: string, rel: string): T | null => {
  const file = path.join(dir, ...rel.split('/'));
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
};
/** Validates `doc` against its path's schema, then writes it; exits without writing on a schema failure. */
function writeDoc(dir: string, rel: string, doc: unknown): void {
  const checked = schemaForPath(rel)?.safeParse(doc);
  if (!checked?.success) {
    console.error(`The built ${rel} fails its schema; nothing was written.${checked && !checked.success ? `\n${checked.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`).join('\n')}` : ''}`);
    process.exit(1);
  }
  const file = path.join(dir, ...rel.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Wrote ${file}.`);
}
/** Prints a report's warnings and errors to the console (3c imports write no report file). */
function printReport(report: Report): void {
  for (const e of report.entries.filter(x => x.level !== 'info')) console.warn(`${e.level}: [${e.topic}] ${e.message}`);
}

async function refreshRosters(): Promise<void> {
  const meta = readJson<MetaFile>('meta.json');
  const season = meta.currentSeason;
  for (const league of ['fba', 'fbad2']) {
    const rel = `leagues/${league}/S${season}/transactions.json`;
    if (existsSync(path.join(DATA, ...rel.split('/'))) && readJson<TransactionsFile>(rel).entries.length > 0) {
      console.error(`Refusing to refresh: moves have already been made in the app (${rel}). Refreshing would overwrite them.`);
      process.exit(1);
    }
  }
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.rosters}.xlsx`), { force: true });
  rmSync(path.join(CACHE, `${SHEETS.draft}.xlsx`), { force: true });
  console.log('Downloading current Rosters and Draft History sheets...');
  const rostersBook = await downloadWorkbook(SHEETS.rosters, CACHE);
  const faTab = `Free Agents S${season}`;
  const tabs = await readTabs(rostersBook, ['FBA Rosters', 'FBA D2 Rosters', faTab]);
  const underlined = await readUnderlines(rostersBook, 'FBA Rosters');
  const draftBook = await downloadWorkbook(SHEETS.draft, CACHE);
  const pickSeasons = [1, 2, 3, 4].map(i => season + i);
  const draftTabs = await readTabs(draftBook, pickSeasons.map(s => `S${s}`));

  const files = assembleRefresh({
    season,
    players: readJson<PlayersFile>('players.json'),
    fbaTeams: readJson<TeamsFile>('leagues/fba/teams.json'),
    d2Teams: readJson<TeamsFile>('leagues/fbad2/teams.json'),
    fbaSheet: parseFbaRosterTab(tabs['FBA Rosters'], underlined),
    d2Sheet: parseD2RosterTab(tabs['FBA D2 Rosters']),
    reserves: parseD2ReservesTab(tabs['FBA D2 Rosters']),
    freeAgents: parseFreeAgentsTab(tabs[faTab]),
    picks: pickSeasons.flatMap(s => parsePickRows(draftTabs[`S${s}`], s)),
  }, report);

  for (const [rel, doc] of Object.entries(files)) {
    const r = schemaForPath(rel)?.safeParse(doc);
    if (!r?.success) report.error('schema', `${rel}: ${r ? r.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ') : 'no schema'}`);
  }
  const reportPath = path.join(WEB, 'importers', 'refresh-report.md');
  writeFileSync(reportPath, report.toMarkdown('Roster refresh report'));
  if (report.hasErrors) {
    console.error(`Refresh found ${report.count('error')} error(s); nothing was written. See web/importers/refresh-report.md`);
    process.exit(1);
  }
  for (const [rel, doc] of Object.entries(files)) {
    const file = path.join(DATA, ...rel.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
  console.log(`Refreshed ${Object.keys(files).length} documents (${report.count('warn')} warnings). Report: web/importers/refresh-report.md`);
}

async function importHallOfFame(): Promise<void> {
  const rel = 'leagues/fba/hallOfFame.json';
  const file = path.join(DATA, ...rel.split('/'));
  if (existsSync(file) && !process.argv.includes('--force')) {
    console.error(`${rel} already exists. Re-run with "npm run import -- --hall-of-fame --force" to overwrite it.`);
    process.exit(1);
  }
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  console.log('Downloading current main sheet...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Hall of Fame']);
  const doc = parseHallOfFameTab(tabs['Hall of Fame'], readJson<PlayersFile>('players.json'), report);
  const r = schemaForPath(rel)?.safeParse(doc);
  if (!r?.success) report.error('schema', `${rel}: ${r ? r.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ') : 'no schema'}`);
  writeFileSync(path.join(WEB, 'importers', 'hall-of-fame-report.md'), report.toMarkdown('Hall of Fame import report'));
  if (report.hasErrors) {
    console.error(`Hall of Fame import found ${report.count('error')} error(s); nothing was written. See web/importers/hall-of-fame-report.md`);
    process.exit(1);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Wrote ${rel}: ${doc.classes.length} classes, ${doc.nominees.length} nominees (${report.count('warn')} warnings). Report: web/importers/hall-of-fame-report.md`);
}

async function fixNames(): Promise<void> {
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Players']);
  const players = readJson<PlayersFile>('players.json');
  const fixes = planNameFixes(players, parsePlayersTab(tabs['Players']), report);
  writeFileSync(path.join(WEB, 'importers', 'fix-names-report.md'), report.toMarkdown('Name check report'));
  if (!process.argv.includes('--apply')) {
    console.log(`${fixes.length} renames proposed (nothing written). See web/importers/fix-names-report.md, then re-run with --apply.`);
    return;
  }
  const skip = process.argv.flatMap((a, i, all) => (a === '--skip' && all[i + 1] ? [all[i + 1]] : []));
  const next = applyNameFixes(players, fixes, skip);
  const r = schemaForPath('players.json')!.safeParse(next);
  if (!r.success) { console.error('players.json would not validate; nothing written'); process.exit(1); }
  writeFileSync(path.join(DATA, 'players.json'), JSON.stringify(next, null, 2) + '\n');
  console.log(`Renamed ${fixes.filter(f => !skip.includes(f.from)).length} players.`);
}

async function importRecruitingClass(): Promise<void> {
  const meta = readJson<MetaFile>('meta.json');
  const n = meta.currentSeason;
  const boardRel = `leagues/fbajc/S${n - 1}/recruiting.json`;
  const rostersRel = `leagues/fbajc/S${n}/rosters.json`;
  const txRel = `leagues/fbajc/S${n}/transactions.json`;
  if (meta.rosterSeason.fbajc !== n || !existsSync(path.join(DATA, ...rostersRel.split('/')))) {
    console.error(`Set up the S${n} college rosters on the Recruiting page first`);
    process.exit(1);
  }
  const boardFile = path.join(DATA, ...boardRel.split('/'));
  const players = readJson<PlayersFile>('players.json');
  const previous = previousImportProblem(existsSync(boardFile) ? readJson<RecruitingFile>(boardRel) : null, players);
  if (previous) {
    console.error(previous);
    process.exit(1);
  }
  if (existsSync(path.join(DATA, ...boardRel.split('/'))) && !process.argv.includes('--force')) {
    console.error(`${boardRel} already exists. Re-run with "npm run import -- --recruiting-class --force" to overwrite it.`);
    process.exit(1);
  }
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.collegeHistory}.xlsx`), { force: true });
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  console.log('Downloading the FBAJC history sheet and the main sheet...');
  const recruitingTabs = await readTabs(await downloadWorkbook(SHEETS.collegeHistory, CACHE), ['FBA JC Recruiting']);
  const playersTabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Players']);
  const rows = parseClassSection(recruitingTabs['FBA JC Recruiting'], n);
  const txFile = path.join(DATA, ...txRel.split('/'));
  const files = buildClassImport({
    rows,
    classOf: n,
    players,
    teams: readJson<TeamsFile>('leagues/fbajc/teams.json'),
    rosters: readJson<RostersFile>(rostersRel),
    tx: existsSync(txFile) ? readJson<TransactionsFile>(txRel) : { league: 'fbajc', season: n, entries: [] },
    calendar: readJson<CalendarFile>('calendar.json'),
    sheet: parsePlayersTab(playersTabs['Players']),
  }, report, { batchId: `import-s${n}-class` });
  for (const f of files) {
    const r = schemaForPath(f.path)?.safeParse(f.doc);
    if (!r?.success) report.error('schema', `${f.path}: ${r ? r.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ') : 'no schema'}`);
  }
  writeFileSync(path.join(WEB, 'importers', 'recruiting-class-report.md'), report.toMarkdown(`S${n} class import report`));
  if (report.hasErrors) {
    console.error(`The class import found ${report.count('error')} error(s); nothing was written. See web/importers/recruiting-class-report.md`);
    process.exit(1);
  }
  for (const f of files) {
    const file = path.join(DATA, ...f.path.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(f.doc, null, 2) + '\n');
  }
  console.log(`Wrote ${files.length} documents for the S${n} class: ${rows.length} recruits (${report.count('warn')} warnings). Report: web/importers/recruiting-class-report.md`);
}

/** Every `*.json` under `dir`, by relative path, skipping the save server's backup and journal folders. */
function readJsonDocs(dir: string): Map<string, unknown> {
  const docs = new Map<string, unknown>();
  const walk = (rel: string): void => {
    for (const e of readdirSync(path.join(dir, ...rel.split('/').filter(Boolean)), { withFileTypes: true })) {
      if (e.name === '.backups' || e.name === '.journal') continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (e.name.endsWith('.json')) docs.set(child, JSON.parse(readFileSync(path.join(dir, ...child.split('/')), 'utf8')));
    }
  };
  walk('');
  return docs;
}

async function importHistory(): Promise<void> {
  const r = parseDataArg(process.argv, '');
  if ('error' in r || !r.dir) {
    console.error('--history needs --data <dir>: the data folder to read and write (use a scratch copy first).');
    process.exit(1);
  }
  const dir = r.dir;
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  rmSync(path.join(CACHE, `${SHEETS.pastStandings}.xlsx`), { force: true });
  console.log('Downloading the main sheet and the past standings sheet...');
  const seasons = Array.from({ length: 8 }, (_, k) => 71 + k);
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Championships', 'Awards, Conference Titles, & AS', 'All-FBA Teams', 'Players', 'FBA Awards Won By Player']);
  const standingTabs = await readTabs(await downloadWorkbook(SHEETS.pastStandings, CACHE), seasons.map(s => `S${s}`));

  const files = planHistoryImport({
    docs: readJsonDocs(dir),
    tabs,
    standingTabs,
    ppgText: read('FBA/League-Points-Stats.txt'),
    brackets: JSON.parse(readFileSync(path.join(WEB, 'importers', 'history', 'fbaBrackets.json'), 'utf8')),
  }, report);

  writeFileSync(path.join(WEB, 'importers', 'history-report.md'), report.toMarkdown('History import report'));
  if (report.hasErrors) {
    console.error(`The history import found ${report.count('error')} error(s); nothing was written. See web/importers/history-report.md`);
    process.exit(1);
  }
  for (const [rel, doc] of files) {
    const file = path.join(dir, ...rel.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
  const merged = report.entries.filter(e => e.topic === 'duplicates' && e.level === 'info').length;
  const bios = (files.find(f => f[0] === 'leagues/fba/playerBios.json')?.[1] as PlayerBiosFile).bios.length;
  const summaries = files.filter(f => /^leagues\/fba\/S\d+\/summary\.json$/.test(f[0])).length;
  console.log(`Merged ${merged} duplicate players; wrote ${summaries} summaries and ${bios} bios to ${dir} (${report.count('warn')} warnings). Report: web/importers/history-report.md`);
}

/** Rebuilds logos/manifest.json from the FBA Logos folder, after logos are added or renamed. Writes nothing else. */
function refreshLogos(): void {
  const rel = 'logos/manifest.json';
  const report = new Report();
  const manifest = buildLogoManifest(path.join(REPO, 'FBA Logos'), report);
  const checked = schemaForPath(rel)?.safeParse(manifest);
  if (!checked?.success) {
    console.error(`The rebuilt ${rel} fails its schema; nothing was written.`);
    process.exit(1);
  }
  const file = path.join(dataDir(), ...rel.split('/'));
  const before = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as LogoManifest) : null;
  const { added, removed, changed } = diffLogoManifests(before, manifest);
  for (const e of report.entries.filter(x => x.level === 'warn')) console.warn(`warning: ${e.message}`);
  if (added.length + removed.length + changed.length === 0) {
    console.log(`${rel} is already up to date.`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  for (const [label, list] of [['Added', added], ['Removed', removed], ['Changed', changed]] as const) {
    if (list.length) console.log(`${label}: ${list.join(', ')}`);
  }
  console.log(`Wrote ${file}.`);
}

/** Reads each franchise's name eras from the team history sheet into leagues/fba/franchises.json. Writes nothing else. */
async function importFranchises(): Promise<void> {
  const rel = 'leagues/fba/franchises.json';
  const dir = dataDir();
  rmSync(path.join(CACHE, `${SHEETS.teamHistory}.xlsx`), { force: true });
  console.log('Downloading the team history sheet (about 75 MB)...');
  const book = await downloadWorkbook(SHEETS.teamHistory, CACHE);
  const tabs = await readTabs(book, n => /^[A-Z]+$/.test(n));
  const ids = Object.keys(tabs);
  const franchises: Franchise[] = [];
  for (const id of ids) {
    const { eras, problems } = parseFranchiseTab(tabs[id]);
    for (const p of problems) console.warn(`warning: ${id} ${p}`);
    if (eras.length) franchises.push({ teamId: id, eras });
    else console.warn(`warning: ${id} has no name eras`);
  }
  const doc: FranchisesFile = { franchises };
  if (!franchises.length || !schemaForPath(rel)?.safeParse(doc).success) {
    console.error(`The parsed ${rel} is empty or fails its schema; nothing was written.`);
    process.exit(1);
  }
  const teamsFile = path.join(dir, 'leagues', 'fba', 'teams.json');
  if (existsSync(teamsFile)) {
    const known = new Set((JSON.parse(readFileSync(teamsFile, 'utf8')) as TeamsFile).teams.map(t => t.teamId));
    const extra = franchises.filter(f => !known.has(f.teamId)).map(f => f.teamId);
    if (extra.length) console.log(`Not in teams.json yet: ${extra.join(', ')}`);
  }
  const file = path.join(dir, ...rel.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  const eraCount = franchises.reduce((n, f) => n + f.eras.length, 0);
  console.log(`Wrote ${file}: ${franchises.length} franchises, ${eraCount} name eras.`);
}

/** Reads the draft sheet's S49–S79 FBA and expansion drafts into leagues/fba/draftHistory.json. Writes nothing else. */
async function importDraftHistory(): Promise<void> {
  const dir = requireDataDir('--drafts');
  const players = readDataJson<PlayersFile>(dir, 'players.json');
  const franchises = readDataJson<FranchisesFile>(dir, 'leagues/fba/franchises.json');
  if (!players || !franchises) {
    console.error('--drafts needs players.json and leagues/fba/franchises.json in the data folder (run --franchises first).');
    process.exit(1);
  }
  rmSync(path.join(CACHE, `${SHEETS.draft}.xlsx`), { force: true });
  console.log('Downloading the draft history sheet...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.draft, CACHE), n => { const k = draftTabKind(n); return !!k && k.season <= 79; });
  const report = new Report();
  const doc = buildDraftHistory(tabs, { players, franchises, lastSeason: 79 }, report);
  printReport(report);
  for (const d of doc.drafts) console.log(`S${d.season} ${d.kind}: ${d.picks.filter(p => p.pick !== null).length} picks, ${d.picks.filter(p => p.pick === null).length} undrafted`);
  writeDoc(dir, 'leagues/fba/draftHistory.json', doc);
}

/** Reads the main sheet's Transactions tab into leagues/fba/pastTransactions.json. Writes nothing else. */
async function importPastTransactions(): Promise<void> {
  const dir = requireDataDir('--transactions');
  const players = readDataJson<PlayersFile>(dir, 'players.json');
  const franchises = readDataJson<FranchisesFile>(dir, 'leagues/fba/franchises.json');
  if (!players || !franchises) {
    console.error('--transactions needs players.json and leagues/fba/franchises.json in the data folder (run --franchises first).');
    process.exit(1);
  }
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  console.log('Downloading the main history sheet...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Transactions']);
  const report = new Report();
  const doc = buildPastTransactions(tabs['Transactions'] ?? [], { players, franchises }, report);
  printReport(report);
  console.log(`${doc.seasons.length} seasons, ${doc.seasons.reduce((n, s) => n + s.entries.length, 0)} entries.`);
  writeDoc(dir, 'leagues/fba/pastTransactions.json', doc);
}

/** Reads the main sheet's Events tab plus importers/history/ruleChanges.json into leagues/fba/events.json. Writes nothing else. */
async function importEvents(): Promise<void> {
  const dir = requireDataDir('--events');
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  console.log('Downloading the main history sheet...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Events']);
  const rules = JSON.parse(readFileSync(path.join(WEB, 'importers', 'history', 'ruleChanges.json'), 'utf8')) as { season: number; lines: string[] }[];
  const doc = buildEvents(parseEventsTab(tabs['Events'] ?? []), rules);
  console.log(`${doc.before.length} pre-FBA notes, ${doc.seasons.length} seasons with notes or rules.`);
  writeDoc(dir, 'leagues/fba/events.json', doc);
}

/** Compares each team tab's trophy counts on the team history sheet with the counts derived from the app's data. Read-only. */
async function checkTrophies(): Promise<void> {
  const dir = requireDataDir('--check-trophies');
  const teams = readDataJson<TeamsFile>(dir, 'leagues/fba/teams.json');
  if (!teams) {
    console.error('--check-trophies needs leagues/fba/teams.json in the data folder.');
    process.exit(1);
  }
  const fbaDir = path.join(dir, 'leagues', 'fba');
  const summaries = readdirSync(fbaDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^S\d+$/.test(e.name) && existsSync(path.join(fbaDir, e.name, 'summary.json')))
    .map(e => JSON.parse(readFileSync(path.join(fbaDir, e.name, 'summary.json'), 'utf8')) as SummaryFile);
  const input = {
    summaries,
    teams: teams.teams,
    franchises: readDataJson<FranchisesFile>(dir, 'leagues/fba/franchises.json'),
    hallOfFame: readDataJson<HallOfFameFile>(dir, 'leagues/fba/hallOfFame.json'),
  };
  rmSync(path.join(CACHE, `${SHEETS.teamHistory}.xlsx`), { force: true });
  console.log('Downloading the team history sheet (about 75 MB)...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.teamHistory, CACHE), n => /^[A-Z]+$/.test(n));
  let mismatches = 0;
  for (const id of Object.keys(tabs)) {
    const sheet = parseTeamTabCounts(tabs[id]);
    if (!sheet) {
      console.warn(`warning: ${id} has no trophy header row`);
      continue;
    }
    const c = trophyCase(id, input);
    const app: Record<string, number> = {
      championships: c.championships.length, finals: c.finals.length, confTitles: c.confTitles.length, tournaments: c.tournaments.length,
      hallOfFamers: c.hallOfFamers.length,
      ...Object.fromEntries(TROPHY_AWARDS.map(a => [a, c.awards.filter(x => x.award === a).length])),
    };
    for (const key of Object.keys(sheet)) {
      if (sheet[key] !== app[key]) {
        console.log(`${id} ${key}: sheet ${sheet[key]}, app ${app[key]}`);
        mismatches++;
      }
    }
  }
  console.log(`${mismatches} mismatches across ${Object.keys(tabs).length} team tabs.`);
}

const MODE_FLAGS = ['--logos', '--franchises', '--refresh-rosters', '--hall-of-fame', '--fix-names', '--recruiting-class', '--history', '--drafts', '--transactions', '--events', '--check-trophies'];

async function main(): Promise<void> {
  const modes = MODE_FLAGS.filter(f => process.argv.includes(f));
  if (modes.length > 1) {
    console.error(`Give one mode flag at a time (got ${modes.join(', ')}).`);
    process.exit(1);
  }
  if (process.argv.includes('--logos')) return refreshLogos();
  if (process.argv.includes('--franchises')) return importFranchises();
  if (process.argv.includes('--refresh-rosters')) return refreshRosters();
  if (process.argv.includes('--hall-of-fame')) return importHallOfFame();
  if (process.argv.includes('--fix-names')) return fixNames();
  if (process.argv.includes('--recruiting-class')) return importRecruitingClass();
  if (process.argv.includes('--history')) return importHistory();
  if (process.argv.includes('--drafts')) return importDraftHistory();
  if (process.argv.includes('--transactions')) return importPastTransactions();
  if (process.argv.includes('--events')) return importEvents();
  if (process.argv.includes('--check-trophies')) return checkTrophies();
  if (existsSync(path.join(DATA, 'meta.json')) && !process.argv.includes('--force')) {
    console.error('web/data already holds an import. Re-run with "npm run import -- --force" to overwrite all league data.');
    process.exit(1);
  }
  const report = new Report();

  console.log('Downloading Google Sheets (cached in web/importers/.cache)...');
  const rosterTabs = await readTabs(await downloadWorkbook(SHEETS.rosters, CACHE), ['FBA Rosters', 'FBA D2 Rosters']);
  const mainTabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['FBA Calender']);

  console.log('Parsing sources...');
  const files = assemble({
    fbaTxt: parseRosterTxt(read('FBA/FBARosters.txt'), 'fba'),
    d2Txt: parseRosterTxt(read('FBAD2/FBAD2Rosters'), 'fbad2'),
    jcTxt: parseRosterTxt(read('FBAJC/FBAJCRosters'), 'fbajc'),
    wcTxt: parseRosterTxt(read('FBAWC/FBAWCRosters'), 'fbawc'),
    fbaSheet: parseFbaRosterTab(rosterTabs['FBA Rosters']),
    d2Sheet: parseD2RosterTab(rosterTabs['FBA D2 Rosters']),
    calendar: parseCalendarTab(mainTabs['FBA Calender']),
    fbaResults: parseFbaResults(read('FBA/Results.txt')),
    fbaFinals: parseFbaPlayoffs(read('FBA/Playoffs.txt')),
    d2Finals: parseD2Playoffs(read('FBAD2/Playoffs.txt')),
    jcBracket: parseBracketFile(read('FBAJC/MMBrackets.txt')),
    wcBracket: parseBracketFile(read('FBAWC/MMBrackets.txt')),
    logoManifest: buildLogoManifest(path.join(REPO, 'FBA Logos'), report),
  }, report);

  for (const [rel, doc] of Object.entries(files)) {
    const schema = schemaForPath(rel);
    if (!schema) {
      report.error('schema', `${rel}: no schema registered for this path`);
      continue;
    }
    const r = schema.safeParse(doc);
    if (!r.success) {
      report.error('schema', `${rel}: ${r.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    }
  }

  writeFileSync(REPORT, report.toMarkdown('Import report'));
  if (report.hasErrors) {
    console.error(`Import found ${report.count('error')} error(s); nothing was written to web/data. See web/importers/import-report.md`);
    process.exit(1);
  }

  for (const [rel, doc] of Object.entries(files)) {
    const file = path.join(DATA, ...rel.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
  console.log(`Wrote ${Object.keys(files).length} documents to web/data (${report.count('warn')} warnings). Report: web/importers/import-report.md`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
