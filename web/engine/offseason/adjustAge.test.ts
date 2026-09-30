import { describe, expect, it } from 'vitest';
import { collegeHole } from '../college/setup';
import { calendarProblem } from '../season/moves';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, DraftFile, FreeAgentsFile, MetaFile, RecruitingFile, ReservesFile, RostersFile, TransactionsFile } from '../shared/types';
import { ADJUST_AGE_STEP, adjustAge, adjustAgePreview, ageEntry, draftPath } from './adjustAge';
import { ageBoard, ageCollegeTeams, agePlayers, ageState } from './testFixtures';

const ctx = { batchId: 'b1' };

function run(state = ageState()) {
  const r = adjustAge(state, ctx);
  if (!r.ok) throw new Error(r.problems.join('; '));
  const doc = <T>(path: string) => r.writes.find(w => w.path === path)?.doc as T;
  return { r, doc, paths: r.writes.map(w => w.path) };
}

const problems = (state = ageState()) => {
  const r = adjustAge(state, ctx);
  return r.ok ? [] : r.problems;
};

describe('ageEntry', () => {
  it('sets age = season − birth season, and leaves vacancies and unknown births alone', () => {
    const players = agePlayers();
    const vacancy = { playerId: null, age: null };
    expect(ageEntry({ playerId: 'p00020', age: 21 }, 80, players)).toEqual({ playerId: 'p00020', age: 22 });
    expect(ageEntry({ playerId: 'p00024', age: 30 }, 80, players)).toEqual({ playerId: 'p00024', age: 30 });
    expect(ageEntry(vacancy, 80, players)).toBe(vacancy);
  });
});

describe('adjustAge', () => {
  it('ages every pro entry with a birth season', () => {
    const { doc } = run();
    const fba = doc<RostersFile>('leagues/fba/S80/rosters.json');
    expect(fba.teams.BOS.map(e => e.age)).toEqual([22, 30, null]);
    expect(doc<FreeAgentsFile>('leagues/fba/S80/freeAgents.json').players[0].age).toBe(22);
    expect(doc<RostersFile>('leagues/fbad2/S80/rosters.json').teams.AMS[0].age).toBe(22);
    expect(doc<ReservesFile>('leagues/fbad2/S80/reserves.json').players[0].age).toBe(22);
  });

  it('builds the S80 college rosters and places the S80 commits', () => {
    const { doc } = run();
    const rosters = doc<RostersFile>('leagues/fbajc/S80/rosters.json');
    expect(rosters).toMatchObject({ league: 'fbajc', season: 80, locked: false });
    const [pg, sg, sf, pf, c] = rosters.teams.t1;
    expect(pg).toEqual(collegeHole('PG'));
    expect(sg).toEqual(collegeHole('SG'));
    expect(sf).toEqual(collegeHole('SF'));
    expect(pf).toEqual(collegeHole('PF'));
    expect(c).toEqual({ playerId: 'p00010', position: 'C', rating: 70, age: null, points: 0, stars: 3, classYear: 'Fr' });
    expect(rosters.teams.t2[0]).toEqual({ playerId: 'p00011', position: 'PG', rating: 75, age: null, points: 0, stars: 4, classYear: 'Fr' });
    expect(rosters.teams.t2.slice(1).every(e => e.playerId === null)).toBe(true);
  });

  it('sends a displaced named holder to the board portal, and simply replaces an X holder', () => {
    const { doc } = run();
    const board = doc<RecruitingFile>('leagues/fbajc/S79/recruiting.json');
    expect(board.portal).toEqual([
      { playerId: 'p00003', position: 'C', classYear: 'Jr', rating: 74, stars: 3, projections: {}, committedTo: null, fromTeam: 't1' },
    ]);
    expect(board.recruits).toEqual(ageBoard().recruits);
  });

  it('moves a returning named player up a class year with points reset', () => {
    // Cal Center (So C) stays when nobody commits to his slot.
    const board = ageBoard();
    board.recruits = board.recruits.filter(p => p.playerId !== 'p00010');
    const { doc } = run(ageState({ board }));
    expect(doc<RostersFile>('leagues/fbajc/S80/rosters.json').teams.t1[4]).toEqual({
      playerId: 'p00003', position: 'C', rating: 74, age: null, points: 0, stars: 3, classYear: 'Jr',
    });
  });

  it('puts the named Seniors on a new draft board', () => {
    const { doc } = run();
    expect(doc<DraftFile>(draftPath(80))).toEqual({
      league: 'fba', season: 80, locked: false, started: false, picks: [],
      prospects: [{ playerId: 'p00001', position: 'PG', college: 't1', classYear: 'Sr', senior: true, collegeRating: 80, stars: 4, fbaRating: null }],
    });
  });

  it('sets meta.rosterSeason.fbajc, marks the step done and logs both leagues', () => {
    const { r, doc } = run();
    expect(r.ok && r.label).toBe('Adjust Age (S80)');
    expect(doc<MetaFile>('meta.json').rosterSeason).toEqual({ fba: 80, fbad2: 80, fbajc: 80, fbawc: 79 });
    expect(doc<CalendarFile>('calendar.json').steps.find(s => s.id === ADJUST_AGE_STEP)?.done).toBe(true);
    expect(doc<TransactionsFile>('leagues/fbajc/S80/transactions.json').entries).toEqual([
      { seq: 1, batchId: 'b1', type: 'adjust-age', teams: [], lines: ['Class years move up: 1 Senior enters the S80 draft, 1 unnamed Senior leaves, 2 commitments join their schools'] },
      { seq: 2, batchId: 'b1', type: 'portal', teams: ['t1'], lines: ['Cal Center (Jr C, 74) enters the transfer portal from School One'] },
    ]);
    expect(doc<TransactionsFile>('leagues/fba/S80/transactions.json').entries).toEqual([
      { seq: 1, batchId: 'b1', type: 'adjust-age', teams: [], lines: ['4 players age a year'] },
    ]);
  });

  it('writes every document in one batch', () => {
    expect(run().paths).toEqual([
      'leagues/fba/S80/rosters.json',
      'leagues/fba/S80/freeAgents.json',
      'leagues/fbad2/S80/rosters.json',
      'leagues/fbad2/S80/reserves.json',
      'leagues/fbajc/S80/rosters.json',
      'leagues/fbajc/S79/recruiting.json',
      'leagues/fba/S80/draft.json',
      'meta.json',
      'calendar.json',
      'leagues/fba/S80/transactions.json',
      'leagues/fbajc/S80/transactions.json',
    ]);
  });

  it('skips missing free agents and reserves, and writes no board when nothing is placed', () => {
    const { paths, doc } = run(ageState({ freeAgents: null, reserves: null, board: null }));
    expect(paths).not.toContain('leagues/fba/S80/freeAgents.json');
    expect(paths).not.toContain('leagues/fbad2/S80/reserves.json');
    expect(paths.some(p => p.endsWith('recruiting.json'))).toBe(false);
    expect(doc<RostersFile>('leagues/fbajc/S80/rosters.json').teams.t1[4].playerId).toBe('p00003');
    expect(doc<TransactionsFile>('leagues/fbajc/S80/transactions.json').entries[0].lines[0]).toBe(
      'Class years move up: 1 Senior enters the S80 draft, 1 unnamed Senior leaves, 0 commitments join their schools',
    );
    expect(doc<TransactionsFile>('leagues/fba/S80/transactions.json').entries[0].lines).toEqual(['2 players age a year']);
  });

  it('writes no board when the board has no commits', () => {
    const board = ageBoard();
    board.recruits = board.recruits.map(p => ({ ...p, committedTo: null }));
    expect(run(ageState({ board })).paths.some(p => p.endsWith('recruiting.json'))).toBe(false);
  });

  describe('refusals', () => {
    it('off the adjust-age step', () => {
      const calendar = markStepDone(calendarFor80(), ADJUST_AGE_STEP);
      expect(problems(ageState({ calendar }))).toEqual([calendarProblem(calendar, 'adjust-age', 'Ages are adjusted')]);
    });

    it('when the S80 college rosters already exist', () => {
      const s = ageState();
      expect(problems({ ...s, meta: { ...s.meta, rosterSeason: { ...s.meta.rosterSeason, fbajc: 80 } } })).toEqual(['The S80 college rosters already exist']);
    });

    it('without the S79 college rosters', () => {
      expect(problems(ageState({ prevCollege: null }))).toEqual(['The S79 college rosters are missing']);
    });

    it('when the draft board already exists', () => {
      expect(problems(ageState({ draftExists: true }))).toEqual(['The S80 draft board already exists']);
    });

    it('when two commits land on one slot', () => {
      const board = ageBoard();
      board.recruits.push({ playerId: 'p00013', position: 'C', classYear: 'Fr', rating: 66, stars: null, projections: {}, committedTo: 't1' });
      const out = problems(ageState({ board }));
      expect(out).toHaveLength(1);
      expect(out[0]).toContain('School One already has Rick One committed at C');
    });

    it('when a commit goes to a school with no roster', () => {
      const teams = ageCollegeTeams();
      teams.teams.push({ ...teams.teams[0], teamId: 't3', name: 'School Three', abbr: 'THR' });
      const board = ageBoard();
      board.recruits[2] = { ...board.recruits[2], committedTo: 't3' };
      expect(problems(ageState({ board, collegeTeams: teams }))).toEqual(['School Three has no roster']);
    });
  });
});

describe('adjustAgePreview', () => {
  it('matches the move’s counts and lists the displaced', () => {
    const r = adjustAgePreview(ageState());
    expect(r).toEqual({
      ok: true,
      preview: {
        aged: 4, seniors: 1, xSeniors: 1, placed: 2,
        displaced: [{ playerId: 'p00003', teamId: 't1', classYear: 'Jr', position: 'C', rating: 74 }],
      },
    });
  });

  it('refuses as the move does', () => {
    expect(adjustAgePreview(ageState({ draftExists: true }))).toEqual({ ok: false, problems: ['The S80 draft board already exists'] });
  });
});

function calendarFor80(): CalendarFile {
  return ageState().calendar;
}
