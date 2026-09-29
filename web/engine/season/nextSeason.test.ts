import { describe, expect, it } from 'vitest';
import { fullD2State } from '../playoffs/testFixtures';
import { calendarFor } from '../shared/calendar';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import type { CalendarFile, PromotionLine, RecruitingFile, ReservesFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile } from '../shared/types';
import { applyPromotion, nextSeasonDocs, type NextSeasonInput } from './nextSeason';
import { fbaSeasonState } from './testFixtures';

const ctx = { batchId: 'roll' };
const PROMOTION: PromotionLine[] = [
  { league: 'PL', promoted: [], relegated: ['PL15', 'PL16'] },
  { league: 'WL', promoted: ['WL01', 'WL02'], relegated: ['WL15', 'WL16'] },
  { league: 'UL', promoted: ['UL01', 'UL02'], relegated: ['UL15', 'UL16'] },
  { league: 'IL', promoted: ['IL01', 'IL02'], relegated: [] },
];

function ready(): NextSeasonInput {
  const d2 = fullD2State();
  const fba = fbaSeasonState();
  const cal = calendarFor(79);
  const withPoints = (r: RostersFile): RostersFile => ({
    ...r, teams: Object.fromEntries(Object.entries(r.teams).map(([t, es]) => [t, es.map(e => ({ ...e, points: 123 }))])),
  });
  return {
    calendar: { ...cal, steps: cal.steps.map(s => ({ ...s, done: true })) },
    meta: { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    d2Teams: d2.teams,
    fba: {
      rosters: withPoints(fba.rosters),
      freeAgents: { league: 'fba', season: 79, locked: true, players: [] },
      tx: fba.tx,
      summary: { league: 'fba', season: 79, locked: true, host: null, champions: [] },
    },
    fbad2: {
      rosters: withPoints(d2.rosters),
      reserves: { league: 'fbad2', season: 79, locked: false, players: [
        { playerId: 'p09001', position: 'C', age: 30, rating: 60, fromFba: true, fbaRating: 71 },
        { playerId: 'p09002', position: 'PG', age: 24, rating: 55 },
      ] },
      tx: d2.tx,
      ratings: null,
      pool: null,
      draft: { league: 'fbad2', season: 79, locked: false, tickets: [], pool: [], picks: [] },
      summary: { league: 'fbad2', season: 79, locked: true, host: null, champions: [], promotion: PROMOTION },
    },
    nextStarted: false,
    fbajc: { recruiting: null },
  };
}

const run = (input: NextSeasonInput) => {
  const r = nextSeasonDocs(input, ctx);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};

describe('nextSeasonDocs', () => {
  it('locks the S79 recruiting board when there is one', () => {
    const recruiting: RecruitingFile = { league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true, recruits: [], portal: [] };
    const r = run({ ...ready(), fbajc: { recruiting } });
    const paths = r.writes.map(w => w.path);
    expect(paths.indexOf('leagues/fbajc/S79/recruiting.json')).toBe(paths.indexOf('leagues/fbad2/S79/draft.json') + 1);
    expect(r.writes.find(w => w.path === 'leagues/fbajc/S79/recruiting.json')!.doc).toEqual({ ...recruiting, locked: true });
    const done = run({ ...ready(), fbajc: { recruiting: { ...recruiting, locked: true } } });
    expect(done.writes.some(w => w.path.endsWith('/recruiting.json'))).toBe(false);
  });

  it('writes every row of the rollover table, as valid docs', () => {
    const input = ready();
    const r = run(input);
    expect(r.label).toBe('Start S80');
    expect(r.writes.map(w => w.path)).toEqual([
      'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json',
      'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/reserves.json', 'leagues/fbad2/S79/transactions.json', 'leagues/fbad2/S79/draft.json',
      'leagues/fba/S80/rosters.json', 'leagues/fba/S80/freeAgents.json', 'leagues/fba/S80/transactions.json',
      'leagues/fbad2/S80/rosters.json', 'leagues/fbad2/S80/reserves.json', 'leagues/fbad2/S80/transactions.json',
      'leagues/fbad2/teams.json', 'calendar.json', 'meta.json',
    ]);
    for (const w of r.writes) {
      expect(schemaForPath(w.path)!.safeParse(w.doc).success).toBe(true);
      expect(pathAgreementProblem(w.path, w.doc)).toBeNull();
      if (w.path.includes('/S79/')) expect(w.doc).toMatchObject({ locked: true });
    }
    const doc = <T>(p: string) => r.writes.find(w => w.path === p)!.doc as T;

    const fba80 = doc<RostersFile>('leagues/fba/S80/rosters.json');
    expect(fba80.season).toBe(80);
    expect(fba80.locked).toBe(false);
    const [team] = Object.keys(input.fba.rosters.teams);
    expect(fba80.teams[team]).toEqual(input.fba.rosters.teams[team].map(e => ({ ...e, points: 0 })));
    expect(Object.values(doc<RostersFile>('leagues/fbad2/S80/rosters.json').teams).flat().every(e => e.points === 0)).toBe(true);

    expect(doc('leagues/fba/S80/freeAgents.json')).toEqual({ league: 'fba', season: 80, locked: false, players: [] });
    expect(doc<ReservesFile>('leagues/fbad2/S80/reserves.json')).toEqual({ league: 'fbad2', season: 80, locked: false, players: [
      { playerId: 'p09001', position: 'C', age: 30, rating: 60 },
      { playerId: 'p09002', position: 'PG', age: 24, rating: 55 },
    ] });
    for (const lg of ['fba', 'fbad2']) {
      expect(doc<TransactionsFile>(`leagues/${lg}/S80/transactions.json`)).toEqual({
        league: lg, season: 80, entries: [{ seq: 1, batchId: 'roll', type: 'season', teams: [], lines: ['S80 season started'] }],
      });
    }
    expect(doc<CalendarFile>('calendar.json')).toEqual(calendarFor(80));
    expect(doc('meta.json')).toEqual({
      currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
    });
  });

  it('applies promotion and relegation to the D2 teams', () => {
    const r = run(ready());
    const teams = r.writes.find(w => w.path === 'leagues/fbad2/teams.json')!.doc as TeamsFile;
    const group = (id: string) => teams.teams.find(t => t.teamId === id)!.group;
    expect([group('PL15'), group('WL01'), group('WL16'), group('UL02'), group('UL15'), group('IL01'), group('PL01')]).toEqual(['WL', 'PL', 'UL', 'WL', 'IL', 'UL', 'PL']);
    expect(r.moves).toHaveLength(12);
    expect(r.moves[0]).toEqual({ teamId: 'PL15', from: 'PL', to: 'WL' });
    for (const lg of ['PL', 'WL', 'UL', 'IL']) expect(teams.teams.filter(t => t.group === lg)).toHaveLength(16);
  });

  it('refuses until every step is done and both seasons are finished, and once S80 exists', () => {
    const problems = (over: Partial<NextSeasonInput>) => {
      const r = nextSeasonDocs({ ...ready(), ...over }, ctx);
      return r.ok ? [] : r.problems;
    };
    const cal = calendarFor(79);
    expect(problems({ calendar: { ...cal, steps: cal.steps.map(s => ({ ...s, done: s.id !== 'fbajc' })) } })).toEqual(['Finish every S79 calendar step first (current step: FBAJC)']);
    expect(problems({ fba: { ...ready().fba, summary: null } })).toEqual(['Finish the S79 FBA season first']);
    const d2Open: SummaryFile = { league: 'fbad2', season: 79, locked: false, host: null, champions: [] };
    expect(problems({ fbad2: { ...ready().fbad2, summary: d2Open } })).toEqual(['Finish the S79 D2 season first']);
    expect(problems({ nextStarted: true })).toEqual(['S80 has already started']);
    expect(problems({ meta: { ...ready().meta, currentSeason: 78 } })).toEqual(['The calendar is for S79 but the current season is S78']);
  });
});

describe('applyPromotion', () => {
  const teams = () => fullD2State().teams;
  const problems = (lines: PromotionLine[]) => {
    const r = applyPromotion(teams(), lines);
    return r.ok ? [] : r.problems;
  };

  it('rejects a team that is not in the line’s league, a move off the ladder, and uneven leagues', () => {
    expect(problems([{ league: 'WL', promoted: ['PL01'], relegated: [] }])).toEqual(["PL01 isn't in the WL"]);
    expect(problems([{ league: 'PL', promoted: ['PL01'], relegated: [] }])).toEqual(["PL01 can't move out of the PL"]);
    expect(problems([{ league: 'WL', promoted: ['WL01'], relegated: [] }])).toEqual([
      'The PL would have 17 teams (it needs 16)', 'The WL would have 15 teams (it needs 16)',
    ]);
  });

  it('leaves the teams unchanged with no lines', () => {
    const r = applyPromotion(teams(), []);
    expect(r.ok && r.teams).toEqual(teams());
  });
});
