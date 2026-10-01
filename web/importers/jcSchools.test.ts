import { describe, expect, it } from 'vitest';
import type { JcSchoolHistoryFile, TeamsFile } from '../engine/shared/types';
import { buildSchoolHistory, planJcSchools } from './jcSchools';
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
