import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import { assemble } from './assemble';
import { buildLogoManifest } from './logoManifest';
import { Report } from './report';
import { parseCalendarTab, parseD2RosterTab, parseFbaRosterTab } from './sheets/parsers';
import { downloadWorkbook, readTabs } from './sheets/xlsx';
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
};

const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

async function main(): Promise<void> {
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
