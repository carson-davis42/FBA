import { describe, expect, it } from 'vitest';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { CalendarFile, MetaFile, ResultsFile, RostersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { assemble, calendarFrom, leagueForStep, seasonsFor, type ImportInputs } from './assemble';
import { Report } from './report';
import type { TxtPlayer } from './txt/rosters';

const P = (name: string | null, position: TxtPlayer['position'], age: number | null, rating: number, extra: Partial<TxtPlayer> = {}): TxtPlayer => ({
  name, position, age, rating, points: 0, contractLen: null, cost: null, stars: null, classYear: null, ...extra,
});

function inputs(): ImportInputs {
  return {
    fbaTxt: [
      { name: 'Boston Bucks', abbr: 'BOS', group: 'E', players: [P('Gabriel Greenwood', 'PG', 27, 96, { contractLen: 3, cost: 8, points: 2980 })] },
      { name: 'Memphis Blues', abbr: 'MEM', group: 'W', players: [P('Ivory Huntley', 'PG', 25, 97, { contractLen: 2, cost: 9, points: 2900 })] },
    ],
    fbaSheet: [
      { name: 'Boston Bucks', country: null, players: [
        { name: 'Gabriel Greenwood', position: 'PG', age: 28, rating: 95, contractEnd: 80, contractAmount: 8 },
        { name: null, position: 'SG', age: null, rating: null, contractEnd: null, contractAmount: null },
      ] },
      { name: 'Memphis Blues', country: null, players: [{ name: 'Ivory Huntley', position: 'PG', age: 26, rating: 97, contractEnd: 81, contractAmount: 9 }] },
    ],
    d2Txt: [{ name: 'Salzburg', abbr: 'SAL', group: 'PL', players: [P('Ben Montgomery', 'PG', 29, 75)] }],
    d2Sheet: [{ name: 'Salzburg', country: 'Austria', players: [{ name: 'Ben Montgomery', position: 'PG', age: 30, rating: 75, contractEnd: null, contractAmount: null }] }],
    jcTxt: [{ name: 'Duke', abbr: 'DUKE', group: 'ACC', players: [
      P(null, 'C', null, 70, { classYear: 'Fr', points: 100 }),
      P('Ivory Huntley', 'PG', null, 80, { stars: 5, classYear: 'Sr' }),
    ] }],
    wcTxt: [{ name: 'Germany', abbr: 'GER', group: null, players: [P('Gabriel Greenwood', 'PG', 28, 96)] }],
    calendar: {
      season: 79,
      hereIndex: 2,
      steps: [
        { label: 'Adjust Age', sub: true },
        { label: 'S79 FBA Draft', sub: false },
        { label: 'Free Agency/Offseason', sub: false },
        { label: 'FBA D2', sub: false },
        { label: 'FBA', sub: false },
        { label: 'FBAJC', sub: false },
      ],
    },
    fbaResults: [{ gameNo: 1, home: 'Boston Bucks', homePts: 90, away: 'Memphis Blues', awayPts: 80 }],
    fbaFinals: { title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' },
    d2Finals: [{ title: 'Premier League Champion', champion: 'Salzburg', runnerUp: 'Zurich', score: '4-1' }],
    jcBracket: { champion: 'Duke', runnerUp: 'North Carolina', host: null },
    wcBracket: { champion: 'Germany', runnerUp: 'Italy', host: 'Croatia' },
    logoManifest: { folders: { 'Boston Bucks': [{ file: 'Boston Bucks S61-pres..png', from: 61, to: null, variant: 0 }] } },
  };
}

describe('seasonsFor', () => {
  it('handles an odd (non-World Cup) season', () => {
    expect(seasonsFor(79)).toEqual({
      rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
      lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
    });
  });
  it('handles an even (World Cup) season', () => {
    expect(seasonsFor(80).lastSeason.fbawc).toBe(78);
  });
});

describe('calendar mapping', () => {
  it('maps league step labels', () => {
    expect(leagueForStep('FBA D2')).toBe('fbad2');
    expect(leagueForStep('FBA')).toBe('fba');
    expect(leagueForStep('FBAJC')).toBe('fbajc');
    expect(leagueForStep('S80 FBA World Cup')).toBe('fbawc');
    expect(leagueForStep('S79 FBA Draft')).toBeNull();
  });
  it('marks steps before *Here* as done and makes ids unique', () => {
    const cal = calendarFrom({ season: 79, hereIndex: 1, steps: [{ label: 'Adjust Age', sub: true }, { label: 'Adjust Age', sub: true }, { label: 'FBA', sub: false }] });
    expect(cal.steps.map(s => [s.id, s.done, s.kind])).toEqual([
      ['adjust-age', true, 'offseason'],
      ['adjust-age-2', false, 'offseason'],
      ['fba', false, 'league'],
    ]);
  });
});

describe('assemble', () => {
  it('produces every document and they all validate', () => {
    const files = assemble(inputs(), new Report());
    expect(Object.keys(files).sort()).toEqual([
      'calendar.json',
      'leagues/fba/S78/results.json', 'leagues/fba/S78/rosters.json', 'leagues/fba/S78/summary.json',
      'leagues/fba/S79/rosters.json', 'leagues/fba/teams.json',
      'leagues/fbad2/S78/rosters.json', 'leagues/fbad2/S78/summary.json', 'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/teams.json',
      'leagues/fbajc/S78/rosters.json', 'leagues/fbajc/S78/summary.json', 'leagues/fbajc/teams.json',
      'leagues/fbawc/S78/rosters.json', 'leagues/fbawc/S78/summary.json', 'leagues/fbawc/teams.json',
      'logos/manifest.json', 'meta.json', 'players.json',
    ]);
    for (const [rel, doc] of Object.entries(files)) {
      const r = schemaForPath(rel)!.safeParse(doc);
      expect(r.success, `${rel}: ${!r.success && JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it('links players across leagues and seasons', () => {
    const files = assemble(inputs(), new Report());
    const fba79 = files['leagues/fba/S79/rosters.json'] as RostersFile;
    const fba78 = files['leagues/fba/S78/rosters.json'] as RostersFile;
    const jc = files['leagues/fbajc/S78/rosters.json'] as RostersFile;
    const wc = files['leagues/fbawc/S78/rosters.json'] as RostersFile;
    expect(fba78.teams.BOS[0].playerId).toBe(fba79.teams.BOS[0].playerId);
    expect(wc.teams.GER[0].playerId).toBe(fba79.teams.BOS[0].playerId);
    expect(jc.teams.DUKE[1].playerId).toBe(fba79.teams.MEM[0].playerId);
  });

  it('keeps vacancies and converts contracts', () => {
    const files = assemble(inputs(), new Report());
    const fba79 = files['leagues/fba/S79/rosters.json'] as RostersFile;
    const fba78 = files['leagues/fba/S78/rosters.json'] as RostersFile;
    expect(fba79.teams.BOS[1]).toEqual({ playerId: null, position: 'SG', rating: null, age: null, points: 0, contractEnd: null, contractAmount: null });
    expect(fba79.locked).toBe(false);
    expect(fba78.locked).toBe(true);
    expect(fba78.teams.BOS[0]).toMatchObject({ contractEnd: 80, contractAmount: 8, points: 2980 });
  });

  it('builds teams, results, summaries, meta, and calendar', () => {
    const report = new Report();
    const files = assemble(inputs(), report);
    const teams = files['leagues/fba/teams.json'] as TeamsFile;
    expect(teams.teams.find(t => t.teamId === 'BOS')!.logoFolder).toBe('Boston Bucks');
    expect(teams.teams.find(t => t.teamId === 'MEM')!.logoFolder).toBeNull();
    expect((files['leagues/fba/S78/results.json'] as ResultsFile).games[0]).toEqual({ gameNo: 1, home: 'BOS', away: 'MEM', homePts: 90, awayPts: 80 });
    expect((files['leagues/fbawc/S78/summary.json'] as SummaryFile).host).toBe('Croatia');
    expect((files['meta.json'] as MetaFile).rosterSeason).toEqual({ fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 });
    expect((files['calendar.json'] as CalendarFile).steps.map(s => s.done)).toEqual([true, true, false, false, false, false]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('Expected 4 FBAD2 league champions'))).toBe(true);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('Memphis Blues'))).toBe(true);
    expect(report.hasErrors).toBe(false);
  });

  it('reports a sheet team missing from the roster file', () => {
    const inp = inputs();
    inp.fbaSheet[0].name = 'Boston Celtics';
    const report = new Report();
    assemble(inp, report);
    expect(report.hasErrors).toBe(true);
    expect(report.entries.filter(e => e.level === 'error').map(e => e.message)).toEqual([
      'fba: sheet team "Boston Celtics" has no match in the roster file',
      'fba: team "Boston Bucks" is missing from the sheet tab',
    ]);
  });
});
