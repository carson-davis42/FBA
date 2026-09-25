import type {
  CalendarFile, CalendarStep, Champion, GameResult, LeagueId, LogoManifest, MetaFile, ResultsFile, RosterEntry, RostersFile, SummaryFile, TeamsFile,
} from '../engine/shared/types';
import { badgeFor } from './badges';
import { PlayerRegistry } from './registry';
import type { Report } from './report';
import type { ParsedCalendar, SheetTeam } from './sheets/parsers';
import type { BracketOutcome, RawResult } from './txt/archives';
import type { TxtTeam } from './txt/rosters';

export interface ImportInputs {
  fbaTxt: TxtTeam[];
  d2Txt: TxtTeam[];
  jcTxt: TxtTeam[];
  wcTxt: TxtTeam[];
  fbaSheet: SheetTeam[];
  d2Sheet: SheetTeam[];
  calendar: ParsedCalendar;
  fbaResults: RawResult[];
  fbaFinals: Champion | null;
  d2Finals: Champion[];
  jcBracket: BracketOutcome;
  wcBracket: BracketOutcome;
  logoManifest: LogoManifest;
}

export function seasonsFor(current: number): { rosterSeason: Record<LeagueId, number>; lastSeason: Record<LeagueId, number> } {
  const last = current - 1;
  const lastWc = current % 2 === 0 ? current - 2 : current - 1;
  return {
    rosterSeason: { fba: current, fbad2: current, fbajc: last, fbawc: lastWc },
    lastSeason: { fba: last, fbad2: last, fbajc: last, fbawc: lastWc },
  };
}

export function leagueForStep(label: string): LeagueId | null {
  const l = label.trim();
  if (l === 'FBA D2') return 'fbad2';
  if (l === 'FBA') return 'fba';
  if (l === 'FBAJC') return 'fbajc';
  if (/world cup/i.test(l)) return 'fbawc';
  return null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function calendarFrom(parsed: ParsedCalendar): CalendarFile {
  const used = new Set<string>();
  return {
    season: parsed.season,
    steps: parsed.steps.map((s, i): CalendarStep => {
      const base = slug(s.label) || `step-${i + 1}`;
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      const league = leagueForStep(s.label);
      return { id, label: s.label, kind: league ? 'league' : 'offseason', league, sub: s.sub, done: i < parsed.hereIndex };
    }),
  };
}

function teamsFile(league: LeagueId, txt: TxtTeam[], logoFolders: Set<string>, report: Report): TeamsFile {
  const seen = new Set<string>();
  for (const t of txt) {
    if (seen.has(t.abbr)) report.error('teams', `${league}: duplicate abbreviation ${t.abbr}`);
    seen.add(t.abbr);
    if (league === 'fba' && !logoFolders.has(t.name)) report.warn('logos', `No logo folder for FBA team "${t.name}"; a badge will be shown`);
  }
  return {
    league,
    teams: txt.map(t => ({
      teamId: t.abbr,
      name: t.name,
      abbr: t.abbr,
      group: t.group,
      logoFolder: league === 'fba' && logoFolders.has(t.name) ? t.name : null,
      badge: badgeFor(t.name),
    })),
  };
}

function rosterFromTxt(league: LeagueId, season: number, txt: TxtTeam[], reg: PlayerRegistry, locked: boolean): RostersFile {
  const scope = `${league}:S${season}`;
  const teams: Record<string, RosterEntry[]> = {};
  for (const t of txt) {
    teams[t.abbr] = t.players.map(p => {
      const e: RosterEntry = {
        playerId: reg.add(p.name, p.age === null ? null : season - p.age, scope),
        position: p.position,
        rating: p.rating,
        age: p.age,
        points: p.points,
      };
      if (league === 'fba') {
        e.contractEnd = p.contractLen === null ? null : season + p.contractLen - 1;
        e.contractAmount = p.cost;
      }
      if (league === 'fbajc') {
        e.stars = p.stars;
        e.classYear = p.classYear;
      }
      return e;
    });
  }
  return { league, season, locked, teams };
}

function rosterFromSheet(
  league: 'fba' | 'fbad2', season: number, sheet: SheetTeam[], txt: TxtTeam[], reg: PlayerRegistry, report: Report,
): RostersFile {
  const scope = `${league}:S${season}`;
  const abbrByName = new Map(txt.map(t => [t.name, t.abbr]));
  const teams: Record<string, RosterEntry[]> = {};
  for (const st of sheet) {
    const abbr = abbrByName.get(st.name);
    if (!abbr) {
      report.error('rosters', `${league}: sheet team "${st.name}" has no match in the roster file`);
      continue;
    }
    teams[abbr] = st.players.map(p => {
      if (p.name === null) {
        report.info('vacancies', `${league} S${season}: ${st.name} ${p.position} is vacant`);
        const vacant: RosterEntry = { playerId: null, position: p.position, rating: null, age: null, points: 0 };
        if (league === 'fba') { vacant.contractEnd = null; vacant.contractAmount = null; }
        return vacant;
      }
      const e: RosterEntry = {
        playerId: reg.add(p.name, p.age === null ? null : season - p.age, scope),
        position: p.position,
        rating: p.rating === null ? null : Math.round(p.rating),
        age: p.age === null ? null : Math.round(p.age),
        points: 0,
      };
      if (league === 'fba') { e.contractEnd = p.contractEnd; e.contractAmount = p.contractAmount; }
      return e;
    });
  }
  for (const t of txt) if (!teams[t.abbr]) report.error('rosters', `${league}: team "${t.name}" is missing from the sheet tab`);
  return { league, season, locked: false, teams };
}

function resultsFile(season: number, raw: RawResult[], txt: TxtTeam[], report: Report): ResultsFile {
  const idByName = new Map(txt.map(t => [t.name, t.abbr]));
  const games: GameResult[] = [];
  for (const g of raw) {
    const home = idByName.get(g.home);
    const away = idByName.get(g.away);
    if (!home || !away) {
      report.error('results', `Game ${g.gameNo}: unknown team "${home ? g.away : g.home}"`);
      continue;
    }
    games.push({ gameNo: g.gameNo, home, away, homePts: g.homePts, awayPts: g.awayPts });
  }
  return { league: 'fba', season, locked: true, games };
}

function summary(league: LeagueId, season: number, champions: Champion[], host: string | null): SummaryFile {
  return { league, season, locked: true, host, champions };
}

function bracketChampions(title: string, b: BracketOutcome): Champion[] {
  return b.champion ? [{ title, champion: b.champion, runnerUp: b.runnerUp, score: null }] : [];
}

export function assemble(inp: ImportInputs, report: Report): Record<string, unknown> {
  const season = inp.calendar.season;
  const { rosterSeason, lastSeason } = seasonsFor(season);
  const reg = new PlayerRegistry(report);
  const folders = new Set(Object.keys(inp.logoManifest.folders));
  const files: Record<string, unknown> = {};

  files['leagues/fba/teams.json'] = teamsFile('fba', inp.fbaTxt, folders, report);
  files['leagues/fbad2/teams.json'] = teamsFile('fbad2', inp.d2Txt, folders, report);
  files['leagues/fbajc/teams.json'] = teamsFile('fbajc', inp.jcTxt, folders, report);
  files['leagues/fbawc/teams.json'] = teamsFile('fbawc', inp.wcTxt, folders, report);

  files[`leagues/fba/S${rosterSeason.fba}/rosters.json`] = rosterFromSheet('fba', rosterSeason.fba, inp.fbaSheet, inp.fbaTxt, reg, report);
  files[`leagues/fba/S${lastSeason.fba}/rosters.json`] = rosterFromTxt('fba', lastSeason.fba, inp.fbaTxt, reg, true);
  files[`leagues/fbad2/S${rosterSeason.fbad2}/rosters.json`] = rosterFromSheet('fbad2', rosterSeason.fbad2, inp.d2Sheet, inp.d2Txt, reg, report);
  files[`leagues/fbad2/S${lastSeason.fbad2}/rosters.json`] = rosterFromTxt('fbad2', lastSeason.fbad2, inp.d2Txt, reg, true);
  files[`leagues/fbajc/S${lastSeason.fbajc}/rosters.json`] = rosterFromTxt('fbajc', lastSeason.fbajc, inp.jcTxt, reg, true);
  files[`leagues/fbawc/S${lastSeason.fbawc}/rosters.json`] = rosterFromTxt('fbawc', lastSeason.fbawc, inp.wcTxt, reg, true);

  files[`leagues/fba/S${lastSeason.fba}/results.json`] = resultsFile(lastSeason.fba, inp.fbaResults, inp.fbaTxt, report);

  if (!inp.fbaFinals) report.warn('champions', 'No finished FBA Finals found in FBA/Playoffs.txt');
  files[`leagues/fba/S${lastSeason.fba}/summary.json`] = summary('fba', lastSeason.fba, inp.fbaFinals ? [inp.fbaFinals] : [], null);
  if (inp.d2Finals.length !== 4) report.warn('champions', `Expected 4 FBAD2 league champions, found ${inp.d2Finals.length}`);
  files[`leagues/fbad2/S${lastSeason.fbad2}/summary.json`] = summary('fbad2', lastSeason.fbad2, inp.d2Finals, null);
  if (!inp.jcBracket.champion) report.warn('champions', 'No FBAJC national champion found in FBAJC/MMBrackets.txt');
  files[`leagues/fbajc/S${lastSeason.fbajc}/summary.json`] = summary('fbajc', lastSeason.fbajc, bracketChampions('National Champion', inp.jcBracket), null);
  if (!inp.wcBracket.champion) report.warn('champions', 'No World Cup champion found in FBAWC/MMBrackets.txt');
  files[`leagues/fbawc/S${lastSeason.fbawc}/summary.json`] = summary('fbawc', lastSeason.fbawc, bracketChampions('World Cup Champion', inp.wcBracket), inp.wcBracket.host);

  const linked = reg.linkedPlayers();
  const crossLeague = linked.filter(p => new Set(p.scopes.map(s => s.split(':')[0])).size > 1);
  report.info('linked players', `${linked.length} players appear on more than one roster; ${crossLeague.length} of them span leagues`);
  for (const p of crossLeague) report.info('cross-league links', `${p.name} (${p.id}): ${p.scopes.join(', ')}`);

  files['players.json'] = reg.toFile();
  files['calendar.json'] = calendarFrom(inp.calendar);
  const meta: MetaFile = { currentSeason: season, rosterSeason, lastSeason };
  files['meta.json'] = meta;
  files['logos/manifest.json'] = inp.logoManifest;
  return files;
}
