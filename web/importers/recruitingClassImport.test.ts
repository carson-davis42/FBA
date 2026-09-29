import { describe, expect, it } from 'vitest';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { CalendarFile, PlayersFile, RecruitingFile, RankingFile, RostersFile, RosterEntry, TeamsFile, TransactionsFile } from '../engine/shared/types';
import { buildClassImport, previousImportProblem, type ClassImportInput } from './recruitingClassImport';
import { Report } from './report';
import type { ClassRow } from './sheets/recruitingClass';
import type { SheetPlayer } from './sheets/playersTab';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
const teams: TeamsFile = {
  league: 'fbajc',
  teams: [
    { teamId: 'UM', name: 'Michigan', abbr: 'UM', group: 'B10', logoFolder: null, badge },
    { teamId: 'GU', name: 'Gonzaga', abbr: 'GU', group: 'WCC', logoFolder: null, badge },
    { teamId: 'WICH', name: 'Wichita State', abbr: 'WICH', group: 'AAC', logoFolder: null, badge },
  ],
};
const hole = (position: RosterEntry['position']): RosterEntry => ({ playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null });
const x = (playerId: string, position: RosterEntry['position']): RosterEntry => ({ playerId, position, rating: 60, age: null, points: 0, stars: null, classYear: 'So' });
const rosters = (): RostersFile => ({
  league: 'fbajc',
  season: 79,
  locked: false,
  teams: {
    UM: [x('p00001', 'PG'), x('p00002', 'SG'), x('p00003', 'SF'), x('p00004', 'PF'), x('p00005', 'C')],
    GU: [hole('PG'), x('p00006', 'SG'), x('p00007', 'SF'), x('p00008', 'PF'), x('p00009', 'C')],
    WICH: [x('p00010', 'PG'), x('p00011', 'SG'), x('p00012', 'SF'), x('p00013', 'PF'), x('p00014', 'C')],
  },
});
const players = (): PlayersFile => {
  const p: PlayersFile['players'] = {};
  for (let i = 1; i <= 14; i++) {
    const id = `p${String(i).padStart(5, '0')}`;
    p[id] = { id, name: null, birthSeason: null };
  }
  return { nextId: 1914, players: p };
};
const tx: TransactionsFile = { league: 'fbajc', season: 79, entries: [] };
const calendar: CalendarFile = { season: 79, steps: [] };
const sheet: SheetPlayer[] = [
  { name: 'Ann Ace', born: 61 }, { name: 'JJ Clarke', born: 61 }, { name: 'Cal Cook', born: 61 },
];
const rows = (): ClassRow[] => [
  { rank: 1, stars: 5, position: 'PG', name: 'JJ Clarke', r: 95, school: 'Gonzaga', consensus: 98.8 },
  { rank: 2, stars: 4, position: 'SG', name: 'Ann Ace', r: 88, school: '2 PROJ - UM', consensus: 85.5 },
  { rank: 3, stars: 3, position: 'C', name: 'Cal Cook', r: 74, school: '0 PROJ - none', consensus: 72 },
];
const input = (patch: Partial<ClassImportInput> = {}): ClassImportInput => ({
  rows: rows(), classOf: 79, players: players(), teams, rosters: rosters(), tx, calendar, sheet, ...patch,
});
const run = (patch: Partial<ClassImportInput> = {}) => {
  const report = new Report();
  const files = buildClassImport(input(patch), report, { batchId: 'import' });
  return { report, files, doc: (p: string) => files.find(f => f.path === p)?.doc };
};

describe('buildClassImport', () => {
  it('writes the players, board, ranking, rosters and transactions', () => {
    const { files } = run();
    expect(files.map(f => f.path).sort()).toEqual([
      'leagues/fbajc/S78/classRanking.json',
      'leagues/fbajc/S78/recruiting.json',
      'leagues/fbajc/S79/rosters.json',
      'leagues/fbajc/S79/transactions.json',
      'players.json',
    ]);
  });

  it('adds one player per recruit, born S61', () => {
    const doc = run().doc('players.json') as PlayersFile;
    expect(doc.nextId).toBe(1917);
    expect(doc.players.p01914).toEqual({ id: 'p01914', name: 'JJ Clarke', birthSeason: 61 });
    expect(doc.players.p01916.name).toBe('Cal Cook');
  });

  it('builds the S78 board of the class that plays S79', () => {
    const doc = run().doc('leagues/fbajc/S78/recruiting.json') as RecruitingFile;
    expect(doc).toMatchObject({ league: 'fbajc', season: 78, classOf: 79, created: true, classDraft: [], portal: [] });
    expect(doc.recruits.map(r => r.playerId)).toEqual(['p01914', 'p01915', 'p01916']);
    expect(doc.recruits[1]).toEqual({
      playerId: 'p01915', position: 'SG', classYear: 'Fr', rating: 88, stars: 4, consensus: 85.5, projections: { UM: 2 }, committedTo: null,
    });
    expect(doc.recruits[0].committedTo).toBe('GU');
    expect(doc.recruits[2].projections).toEqual({});
  });

  it('writes a locked college-class ranking with both curves', () => {
    const doc = run().doc('leagues/fbajc/S78/classRanking.json') as RankingFile;
    expect(doc).toMatchObject({
      league: 'fbajc', season: 78, kind: 'college-class', locked: true,
      order: ['p01914', 'p01915', 'p01916'],
      ratings: { p01914: 95, p01915: 88, p01916: 74 },
      consensus: { p01914: 98.8, p01915: 85.5, p01916: 72 },
      curve: [95, 88, 74],
      consensusCurve: [98.8, 85.5, 72],
    });
    expect(doc.rows).toHaveLength(3);
  });

  it('orders the ranking by rank and the curves high to low', () => {
    const r = rows().reverse();
    const doc = run({ rows: r }).doc('leagues/fbajc/S78/classRanking.json') as RankingFile;
    expect(doc.order).toHaveLength(3);
    expect(doc.curve).toEqual([95, 88, 74]);
    expect(doc.consensusCurve).toEqual([98.8, 85.5, 72]);
    const board = run({ rows: r }).doc('leagues/fbajc/S78/recruiting.json') as RecruitingFile;
    expect(board.recruits.map(p => p.rating)).toEqual([95, 88, 74]);
  });

  it('places the committed recruit on the S79 roster with a transaction', () => {
    const { doc } = run();
    const r = doc('leagues/fbajc/S79/rosters.json') as RostersFile;
    expect(r.teams.GU[0]).toMatchObject({ playerId: 'p01914', position: 'PG', rating: 95, stars: 5, classYear: 'Fr' });
    const t = doc('leagues/fbajc/S79/transactions.json') as TransactionsFile;
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0].lines[0]).toContain('JJ Clarke');
    expect(t.entries[0].lines[0]).toContain('commits to Gonzaga');
  });

  it('sends a named holder to the portal like the app does', () => {
    const r = rosters();
    r.teams.GU[0] = x('p00006', 'PG');
    const p = players();
    p.players.p00006 = { id: 'p00006', name: 'Old Hand', birthSeason: null };
    const { doc } = run({ rosters: r, players: p });
    expect((doc('leagues/fbajc/S78/recruiting.json') as RecruitingFile).portal.map(t => t.playerId)).toEqual(['p00006']);
  });

  it('projects several schools once each and warns when the count differs', () => {
    const r = rows();
    r[2].school = '3 PROJ - UM, GU';
    const { doc, report } = run({ rows: r });
    expect((doc('leagues/fbajc/S78/recruiting.json') as RecruitingFile).recruits[2].projections).toEqual({ UM: 1, GU: 1 });
    expect(report.entries.some(e => e.level === 'warn' && /3 PROJ/.test(e.message))).toBe(true);
    expect(report.hasErrors).toBe(false);
  });

  it('resolves schools by abbr, then by name', () => {
    const r = rows();
    r[2].school = '1 PROJ - Wichita State';
    const { doc, report } = run({ rows: r });
    expect((doc('leagues/fbajc/S78/recruiting.json') as RecruitingFile).recruits[2].projections).toEqual({ WICH: 1 });
    expect(report.hasErrors).toBe(false);
  });

  it('errors on an unknown school code', () => {
    const r = rows();
    r[2].school = '1 PROJ - NOPE';
    expect(run({ rows: r }).report.entries.some(e => e.level === 'error' && /NOPE/.test(e.message))).toBe(true);
  });

  it('errors on an unknown committed school', () => {
    const r = rows();
    r[0].school = 'Nowhere State';
    expect(run({ rows: r }).report.entries.some(e => e.level === 'error' && /Nowhere State/.test(e.message))).toBe(true);
  });

  it('errors when a commitment cannot be placed', () => {
    const r = rosters();
    delete r.teams.GU;
    expect(run({ rosters: r }).report.hasErrors).toBe(true);
  });

  it('warns when the stars disagree with the consensus cutoffs', () => {
    const r = rows();
    r[1].stars = 5;
    const { report } = run({ rows: r });
    expect(report.entries.some(e => e.level === 'warn' && /Ann Ace/.test(e.message) && /star/i.test(e.message))).toBe(true);
    expect(run().report.entries.filter(e => e.level === 'warn')).toEqual([]);
  });

  it('warns about a name not in the Players tab and about another birth season', () => {
    const { report } = run({ sheet: [{ name: 'Ann Ace', born: 60 }, { name: 'JJ Clarke', born: 61 }] });
    const warns = report.entries.filter(e => e.level === 'warn').map(e => e.message);
    expect(warns.some(m => /Cal Cook/.test(m))).toBe(true);
    expect(warns.some(m => /Ann Ace/.test(m) && /S60/.test(m))).toBe(true);
    expect(warns).toHaveLength(2);
  });

  it('passes schemaForPath for every doc', () => {
    for (const f of run().files) {
      const r = schemaForPath(f.path)?.safeParse(f.doc);
      expect(r?.success, f.path).toBe(true);
    }
  });
});

describe('previousImportProblem', () => {
  it('allows the first import: no board yet', () => {
    expect(previousImportProblem(null, players())).toBeNull();
  });

  it('allows a re-import once the data is restored: the board exists but its recruits are not in players.json', () => {
    const board = run().doc('leagues/fbajc/S78/recruiting.json') as RecruitingFile;
    expect(previousImportProblem(board, players())).toBeNull();
  });

  it("refuses a second import on the first run's output, and says to restore from git", () => {
    const first = run();
    const board = first.doc('leagues/fbajc/S78/recruiting.json') as RecruitingFile;
    const after = first.doc('players.json') as PlayersFile;
    const problem = previousImportProblem(board, after);
    expect(problem).toMatch(/already in players\.json/);
    expect(problem).toContain('git checkout -- web/data');

    // What the second run would have done without the check: mint a second copy of every recruit.
    const second = run({ players: after, rosters: first.doc('leagues/fbajc/S79/rosters.json') as RostersFile, tx: first.doc('leagues/fbajc/S79/transactions.json') as TransactionsFile });
    expect((second.doc('players.json') as PlayersFile).nextId).toBe(1920);
  });
});
