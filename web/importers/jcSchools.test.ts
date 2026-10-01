import { describe, expect, it } from 'vitest';
import type { JcSchoolHistoryFile, PastSeries, TeamsFile } from '../engine/shared/types';
import { applyBracketRounds, buildSchoolHistory, planJcSchools, type JcBracketPage } from './jcSchools';
import { Report } from './report';

const team = (teamId: string, name: string, group: string) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: 'hsl(1 50% 36%)', fg: '#ffffff' } });
const teams = { league: 'fbajc', teams: [team('BAY', 'Baylor', 'B12'), team('BYU', 'BYU', 'B12'), team('VCU', 'VCU', 'A10'), team('DSU', 'Delaware State', 'COL')] } as TeamsFile;

const big12 = (): string[][] => [
  ['School', 'Baylor', 'BYU'],
  ['MM App.', 'Baylor-2', 'BYU-1'], ['', '(S11)', '(S61)'], ['', '(S63)', ''],
  ['Sweet 16', 'Baylor-1', 'BYU-0'], ['', '(S63)', ''],
  ['Elite 8', 'Baylor-1', 'BYU-0'], ['', '(S63)', ''],
  ['Final Four', 'Baylor-1', 'BYU-0'], ['', '(S63)', ''],
  ['NC app.', 'Baylor-1', 'BYU-0'], ['', '(S63)', ''],
  ['National Champions', 'Baylor-1', 'BYU-0'], ['', '(S63)', ''],
  ['Conf RS Champions', 'Baylor-1', 'BYU-1'], ['', '(S60)', '(S62)*A10'],
  ['Conf TOUR Champions', 'Baylor-0', 'BYU-0'], ['', '', ''],
];
const colonial = (): string[][] => [['School', 'Deleware State'], ['MM App.', 'Deleware State-1'], ['', '(S77)'], ['Sweet 16', 'Deleware State-0'], ['', ''], ['Elite 8', 'Deleware State-0'], ['', ''], ['Final Four', 'Deleware State-0'], ['', ''], ['NC app.', 'Deleware State-0'], ['', ''], ['National Champions', 'Deleware State-0'], ['', ''], ['Conf RS Champions', 'Deleware State-0'], ['', ''], ['Conf TOUR Champions', 'Deleware State-0'], ['', '']];
const tabs = { 'Big 12': big12(), Colonial: colonial() };

describe('buildSchoolHistory', () => {
  it('builds one entry per school with rounds and conference titles, in tab order', () => {
    const report = new Report();
    const file = buildSchoolHistory(tabs, teams, null, report);
    expect(file).toMatchObject({ league: 'fbajc', throughSeason: 78 });
    expect(file.schools.map(s => s.teamId)).toEqual(['BAY', 'BYU', 'DSU']);
    expect(file.schools[0]).toEqual({
      teamId: 'BAY',
      mm: { app: [11, 63], sweet16: [63], elite8: [63], final4: [63], titleGame: [63], champion: [63] },
      rsChampion: [{ season: 60, conf: null }], confTournament: [], mmWins: null,
    });
    expect(file.schools[1].rsChampion).toEqual([{ season: 62, conf: 'A10' }]);
    expect(report.hasErrors).toBe(false);
  });
  it('reads the sheet spelling "Abeline Christian" as Abilene Christian', () => {
    const t = { ...teams, teams: [...teams.teams, team('ACU', 'Abilene Christian', 'SOCON')] } as TeamsFile;
    const southern: string[][] = [['School', 'Abeline Christian'], ['MM App.', 'Abeline Christian-0'], ['', ''], ['Sweet 16', 'Abeline Christian-0'], ['', ''], ['Elite 8', 'Abeline Christian-0'], ['', ''], ['Final Four', 'Abeline Christian-0'], ['', ''], ['NC app.', 'Abeline Christian-0'], ['', ''], ['National Champions', 'Abeline Christian-0'], ['', ''], ['Conf RS Champions', 'Abeline Christian-0'], ['', ''], ['Conf TOUR Champions', 'Abeline Christian-0'], ['', '']];
    const report = new Report();
    const file = buildSchoolHistory({ Southern: southern }, t, null, report);
    expect(file.schools.map(x => x.teamId)).toEqual(['ACU']);
    expect(report.hasErrors).toBe(false);
  });
  it('reads the sheet spelling "Deleware State" as Delaware State', () => {
    const file = buildSchoolHistory(tabs, teams, null, new Report());
    expect(file.schools[2].teamId).toBe('DSU');
  });
  it('reports a school it cannot place', () => {
    const report = new Report();
    buildSchoolHistory({ 'Big 12': [['School', 'Nowhere U'], ...big12().slice(1).map(r => [r[0], r[1]])] }, teams, null, report);
    expect(report.entries.some(e => e.level === 'error' && e.message.includes('Nowhere U'))).toBe(true);
  });
  it('warns when a tab does not match the school group in teams.json', () => {
    const report = new Report();
    buildSchoolHistory({ ACC: big12() }, teams, null, report);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('Baylor'))).toBe(true);
  });
  it('reports a conference suffix that is not a conference code', () => {
    const t = big12(); t[15][2] = '(S62)*ZZZ';
    const report = new Report();
    buildSchoolHistory({ 'Big 12': t }, teams, null, report);
    expect(report.entries.some(e => e.level === 'error' && e.message.includes('ZZZ'))).toBe(true);
  });
  it('cross-checks the champion lists against the national champions', () => {
    const ok = new Report();
    buildSchoolHistory(tabs, teams, [{ season: 63, champion: 'Baylor', runnerUp: null, score: null, mvp: null }], ok);
    expect(ok.entries.filter(e => e.level === 'warn')).toEqual([]);
    const bad = new Report();
    buildSchoolHistory(tabs, teams, [{ season: 63, champion: 'BYU', runnerUp: null, score: null, mvp: null }, { season: 64, champion: 'Baylor', runnerUp: null, score: null, mvp: null }], bad);
    const msgs = bad.entries.filter(e => e.level === 'warn' && e.topic === 'jc-schools-check').map(e => e.message);
    expect(msgs.some(m => m.includes('S63'))).toBe(true);
    expect(msgs.some(m => m.includes('S64'))).toBe(true);
  });
});

describe('implied rounds', () => {
  it('adds a season missing from a shallower round and warns, but not for the early era', () => {
    const t = big12();
    t[5][1] = '';        // Baylor loses its Sweet 16 season (S63), which Elite 8 still lists
    t[4][1] = 'Baylor-0';
    const report = new Report();
    const file = buildSchoolHistory({ 'Big 12': t }, teams, null, report);
    expect(file.schools[0].mm.sweet16).toEqual([63]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('S63') && e.message.includes('Sweet 16'))).toBe(true);
    const early = big12();
    early[2][1] = '(S4)*'; early[5][1] = '(S4)*'; early[4][1] = 'Baylor-1';
    const quiet = new Report();
    buildSchoolHistory({ 'Big 12': early }, teams, null, quiet);
    expect(quiet.entries.some(e => e.message.includes('S4'))).toBe(false);
  });
});

describe('planJcSchools', () => {
  it('plans the schoolHistory doc and validates it', () => {
    const { docs, problems } = planJcSchools({ teams, tabs, nationalChampions: null }, new Report());
    expect(problems).toEqual([]);
    expect(docs.map(d => d[0])).toEqual(['leagues/fbajc/schoolHistory.json']);
    expect((docs[0][1] as JcSchoolHistoryFile).schools).toHaveLength(3);
  });
  it('returns the schema problem and no doc when a school is on two tabs', () => {
    const { docs, problems } = planJcSchools({ teams, tabs: { 'Big 12': big12(), ACC: big12() }, nationalChampions: null }, new Report());
    expect(docs).toEqual([]);
    expect(problems.some(p => p.includes('listed twice'))).toBe(true);
  });
  it('plans nothing when the parse reported an error', () => {
    const t = big12(); t[1][1] = 'Baylor-5';
    const { docs } = planJcSchools({ teams, tabs: { 'Big 12': t }, nationalChampions: null }, new Report());
    expect(docs).toEqual([]);
  });
});

describe('applyBracketRounds', () => {
  const names = Array.from({ length: 64 }, (_, i) => `T${i + 1}`);
  const bigTeams = { league: 'fbajc', teams: [...names, 'Outsider'].map((n, i) => team(`ID${i + 1}`, n, 'B12')) } as TeamsFile;
  /** A 64-slot page where the lower slot number always wins: T1 wins it all, T33 loses the final, T17 the semifinal, T9 round 4, T5 round 3, T3 and T2 early. */
  const page = (season: number, rounds = 6): JcBracketPage => {
    const series: PastSeries[] = [];
    const side = (n: number) => ({ name: `T${n}`, record: null, seed: null });
    for (let r = 1; r <= rounds; r++) {
      const count = 2 ** (rounds - r), span = 2 ** r;
      for (let k = 1; k <= count; k++) {
        const lo = (k - 1) * span + 1;
        series.push({ id: `R${r}-${k}`, round: r, home: side(lo), away: side(lo + span / 2), homeWins: 0, awayWins: 0, winner: 'home', unscored: true });
      }
    }
    return { season, rounds, series };
  };
  const entry = (teamId: string, mm: Partial<JcSchoolHistoryFile['schools'][number]['mm']>) => ({
    teamId, mm: { app: [], sweet16: [], elite8: [], final4: [], titleGame: [], champion: [], ...mm }, rsChampion: [], confTournament: [], mmWins: null,
  });
  const base = (schools: ReturnType<typeof entry>[]): JcSchoolHistoryFile => ({ league: 'fbajc', throughSeason: 78, schools });

  it('adds, deepens and removes seasons so each school matches the 64-slot page', () => {
    const file = base([
      entry('ID1', {}),                                                                       // champion missing everywhere
      entry('ID33', { app: [60], sweet16: [60], elite8: [60], final4: [60], titleGame: [60], champion: [60] }), // sheet says champion, page says title game
      entry('ID2', { app: [59] }),                                                            // lost round 1 but missing season 60
      entry('ID65', { app: [60] }),                                                           // on the sheet, not on the page
    ]);
    const report = new Report();
    const out = applyBracketRounds(file, [page(60)], bigTeams, report);
    const by = (id: string) => out.schools.find(s => s.teamId === id)!.mm;
    expect(by('ID1')).toEqual({ app: [60], sweet16: [60], elite8: [60], final4: [60], titleGame: [60], champion: [60] });
    expect(by('ID33').champion).toEqual([]);
    expect(by('ID33').titleGame).toEqual([60]);
    expect(by('ID2')).toMatchObject({ app: [59, 60], sweet16: [] });
    expect(by('ID65').app).toEqual([]);
    expect(report.entries.filter(e => e.topic === 'jc-schools' && e.level === 'info').length).toBeGreaterThan(5);
  });

  it('leaves the other seasons and the input alone, and is a no-op when everything already agrees', () => {
    const file = base([entry('ID1', { app: [11, 60], sweet16: [60], elite8: [60], final4: [60], titleGame: [60], champion: [60] })]);
    const out = applyBracketRounds(file, [page(60)], bigTeams, new Report());
    expect(out.schools[0].mm.app).toEqual([11, 60]);
    expect(file.schools[0].mm.champion).toEqual([60]);
  });

  it('only adds appearances for a page with fewer rounds and never removes', () => {
    const file = base([entry('ID1', { app: [], sweet16: [12] }), entry('ID65', { app: [12] })]);
    const out = applyBracketRounds(file, [page(12, 5)], bigTeams, new Report());
    expect(out.schools[0].mm.app).toEqual([12]);
    expect(out.schools[0].mm.sweet16).toEqual([12]);
    expect(out.schools[1].mm.app).toEqual([12]);
  });

  it('ignores NIT pages and warns about a team with no school entry', () => {
    const report = new Report();
    const out = applyBracketRounds(base([entry('ID1', {})]), [{ ...page(72, 5), kind: 'NIT' }, page(60)], bigTeams, report);
    expect(out.schools[0].mm.app).toEqual([60]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('no school history entry'))).toBe(true);
  });

  it('planJcSchools applies the pages when it is given them', () => {
    const { docs } = planJcSchools({ teams, tabs, nationalChampions: null, brackets: [] }, new Report());
    expect(docs).toHaveLength(1);
  });
});
