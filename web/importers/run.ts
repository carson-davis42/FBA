import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CalendarFile, MetaFile, PlayersFile, RecruitingFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile } from '../engine/shared/types';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import { assemble } from './assemble';
import { buildHistory } from './history';
import { buildLogoManifest } from './logoManifest';
import { Report } from './report';
import { assembleRefresh } from './refresh';
import { applyNameFixes, planNameFixes } from './fixNames';
import { buildClassImport, previousImportProblem } from './recruitingClassImport';
import { parseHallOfFameTab } from './sheets/hallOfFame';
import { parseAllFba, parseAwards, parseBios, parseChampionships, parsePastStandings } from './sheets/history';
import { parseCalendarTab, parseD2ReservesTab, parseD2RosterTab, parseFbaRosterTab, parseFreeAgentsTab, parsePickRows } from './sheets/parsers';
import { parsePlayersTab } from './sheets/playersTab';
import { parseClassSection } from './sheets/recruitingClass';
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
};

const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(DATA, ...rel.split('/')), 'utf8')) as T;

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

async function importHistory(): Promise<void> {
  const i = process.argv.indexOf('--data');
  const dirArg = i >= 0 ? process.argv[i + 1] : undefined;
  if (!dirArg || dirArg.startsWith('--')) {
    console.error('--history needs --data <dir>: the data folder to read and write (use a scratch copy first).');
    process.exit(1);
  }
  const dir = path.resolve(dirArg);
  const readDir = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, ...rel.split('/')), 'utf8')) as T;
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  rmSync(path.join(CACHE, `${SHEETS.pastStandings}.xlsx`), { force: true });
  console.log('Downloading the main sheet and the past standings sheet...');
  const seasons = Array.from({ length: 8 }, (_, k) => 71 + k);
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Championships', 'Awards, Conference Titles, & AS', 'All-FBA Teams', 'Players']);
  const standingTabs = await readTabs(await downloadWorkbook(SHEETS.pastStandings, CACHE), seasons.map(s => `S${s}`));

  const existing = new Map<number, SummaryFile>();
  for (let n = 1; n <= 78; n++) {
    const rel = `leagues/fba/S${n}/summary.json`;
    if (existsSync(path.join(dir, ...rel.split('/')))) existing.set(n, readDir<SummaryFile>(rel));
  }
  const players = readDir<PlayersFile>('players.json');
  const out = buildHistory({
    players,
    teams: [...readDir<TeamsFile>('leagues/fba/teams.json').teams, ...readDir<TeamsFile>('leagues/fbad2/teams.json').teams],
    existing,
    champs: parseChampionships(tabs['Championships']),
    awards: parseAwards(tabs['Awards, Conference Titles, & AS']),
    allFba: parseAllFba(tabs['All-FBA Teams']),
    standings: new Map(seasons.map(s => [s, parsePastStandings(standingTabs[`S${s}`])])),
    bios: parseBios(tabs['Players']),
    brackets: JSON.parse(readFileSync(path.join(WEB, 'importers', 'history', 'fbaBrackets.json'), 'utf8')),
  }, report);
  report.info('players', `Added ${Object.keys(out.players.players).length - Object.keys(players.players).length} players`);
  const playersCheck = schemaForPath('players.json')!.safeParse(out.players);
  if (!playersCheck.success) report.error('schema', `players.json: ${playersCheck.error.issues.slice(0, 3).map(x => `${x.path.join('.')} ${x.message}`).join('; ')}`);

  writeFileSync(path.join(WEB, 'importers', 'history-report.md'), report.toMarkdown('History import report'));
  if (report.hasErrors) {
    console.error(`The history import found ${report.count('error')} error(s); nothing was written. See web/importers/history-report.md`);
    process.exit(1);
  }
  const files: [string, unknown][] = [
    ['players.json', out.players],
    ['leagues/fba/playerBios.json', out.bios],
    ...out.summaries.map((s): [string, unknown] => [`leagues/fba/S${s.season}/summary.json`, s]),
  ];
  for (const [rel, doc] of files) {
    const file = path.join(dir, ...rel.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
  console.log(`Wrote ${out.summaries.length} summaries and ${out.bios.bios.length} bios to ${dir} (${report.count('warn')} warnings). Report: web/importers/history-report.md`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--refresh-rosters')) return refreshRosters();
  if (process.argv.includes('--hall-of-fame')) return importHallOfFame();
  if (process.argv.includes('--fix-names')) return fixNames();
  if (process.argv.includes('--recruiting-class')) return importRecruitingClass();
  if (process.argv.includes('--history')) return importHistory();
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
