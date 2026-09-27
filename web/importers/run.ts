import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MetaFile, PlayersFile, TeamsFile, TransactionsFile } from '../engine/shared/types';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import { assemble } from './assemble';
import { buildLogoManifest } from './logoManifest';
import { Report } from './report';
import { assembleRefresh } from './refresh';
import { parseCalendarTab, parseD2ReservesTab, parseD2RosterTab, parseFbaRosterTab, parseFreeAgentsTab, parsePickRows } from './sheets/parsers';
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

async function main(): Promise<void> {
  if (process.argv.includes('--refresh-rosters')) return refreshRosters();
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
