import { describe, expect, it } from 'vitest';
import type { DraftFile, RecruitingFile, RostersFile, TransactionsFile } from '../shared/types';
import { backToSchool, boardOrder, declare, declareCandidates, draftBoardProblem, draftToPortal, setProspectRating } from './draftBoard';
import { draftBoardBoard, draftBoardDraft, draftBoardState } from './testFixtures';

const ctx = { batchId: 'b1' };
const paths = { draft: 'leagues/fba/S80/draft.json', rosters: 'leagues/fbajc/S80/rosters.json', board: 'leagues/fbajc/S79/recruiting.json', tx: 'leagues/fbajc/S80/transactions.json' };

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
}
const doc = <T>(r: { writes: { path: string; doc: unknown }[] }, path: string) => r.writes.find(w => w.path === path)?.doc as T;
const problems = (r: { ok: boolean }) => (r as unknown as { problems: string[] }).problems;
const started = () => draftBoardState({ draft: { ...draftBoardDraft(), started: true } });

describe('draftBoardProblem', () => {
  it('is null until the draft starts', () => {
    expect(draftBoardProblem(draftBoardDraft())).toBeNull();
    expect(draftBoardProblem({ ...draftBoardDraft(), started: true })).toBe('The S80 draft has started');
  });
});

describe('declareCandidates', () => {
  it('lists named So/Jr/Sr, by school then position, without X, Fr, or board players', () => {
    expect(declareCandidates(draftBoardState()).map(c => [c.playerId, c.teamId, c.position, c.classYear, c.rating])).toEqual([
      ['p00031', 't1', 'SG', 'So', 70],
      ['p00003', 't1', 'C', 'Jr', 74],
      ['p00033', 't2', 'SF', 'So', 61],
    ]);
  });
});

describe('declare', () => {
  it('opens his slot, adds the prospect and logs a declare', () => {
    const r = ok(declare(draftBoardState(), 'p00003', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft, paths.rosters, paths.tx]);
    expect(r.label).toBe('Cal Center declares for the draft');
    expect(doc<DraftFile>(r, paths.draft).prospects.at(-1)).toEqual({
      playerId: 'p00003', position: 'C', college: 't1', classYear: 'Jr', senior: false, collegeRating: 74, stars: 3, fbaRating: null,
    });
    expect(doc<RostersFile>(r, paths.rosters).teams.t1[4]).toEqual({ playerId: null, position: 'C', rating: null, age: null, points: 0, stars: null, classYear: null });
    expect(doc<TransactionsFile>(r, paths.tx).entries).toEqual([
      { seq: 1, batchId: 'b1', type: 'declare', teams: ['t1'], lines: ['Cal Center (Jr C, School One) declares for the S80 draft'] },
    ]);
  });
  it('refuses a non-candidate and a started draft', () => {
    expect(problems(declare(draftBoardState(), 'p00002', ctx))).toEqual(["X can't declare"]);
    expect(problems(declare(draftBoardState(), 'p00032', ctx))).toEqual(["Fred Fresh can't declare"]);
    expect(problems(declare(started(), 'p00003', ctx))).toEqual(['The S80 draft has started']);
  });
});

describe('backToSchool', () => {
  it('restores him to his open slot', () => {
    const r = ok(backToSchool(draftBoardState(), 'p00034', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft, paths.rosters, paths.tx]);
    expect(doc<DraftFile>(r, paths.draft).prospects.map(p => p.playerId)).toEqual(['p00001', 'p00035', 'p00036']);
    expect(doc<RostersFile>(r, paths.rosters).teams.t1[3]).toEqual({ playerId: 'p00034', position: 'PF', rating: 70, age: null, points: 0, stars: 3, classYear: 'Jr' });
    expect(doc<TransactionsFile>(r, paths.tx).entries[0]).toMatchObject({ type: 'declare', teams: ['t1'], lines: ['Dan Draftee returns to School One'] });
    expect(r.label).toBe('Dan Draftee returns to School One');
  });
  it('sends him to the portal when his slot is taken', () => {
    const r = ok(backToSchool(draftBoardState(), 'p00036', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft, paths.board, paths.tx]);
    expect(doc<DraftFile>(r, paths.draft).prospects.map(p => p.playerId)).not.toContain('p00036');
    expect(doc<RecruitingFile>(r, paths.board).portal.at(-1)).toEqual({
      playerId: 'p00036', position: 'SG', classYear: 'Jr', rating: 72, stars: 3, projections: {}, committedTo: null, fromTeam: 't1',
    });
    expect(doc<TransactionsFile>(r, paths.tx).entries[0]).toMatchObject({
      type: 'portal', teams: ['t1'],
      lines: ['Tim Taken (Jr SG, 72) returns from the draft; his School One spot is taken, so he enters the transfer portal'],
    });
  });
  it('refuses a Senior, a stranger and a started draft', () => {
    expect(problems(backToSchool(draftBoardState(), 'p00001', ctx))).toEqual(["Seniors can't go back to school"]);
    expect(problems(backToSchool(draftBoardState(), 'p00003', ctx))).toEqual(["Cal Center isn't on the draft board"]);
    expect(problems(backToSchool(started(), 'p00034', ctx))).toEqual(['The S80 draft has started']);
  });
});

describe('draftToPortal', () => {
  it('moves him to the portal and logs it', () => {
    const r = ok(draftToPortal(draftBoardState(), 'p00034', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft, paths.board, paths.tx]);
    expect(doc<DraftFile>(r, paths.draft).prospects.map(p => p.playerId)).toEqual(['p00001', 'p00035', 'p00036']);
    expect(doc<RecruitingFile>(r, paths.board).portal.at(-1)).toEqual({
      playerId: 'p00034', position: 'PF', classYear: 'Jr', rating: 70, stars: 3, projections: {}, committedTo: null, fromTeam: 't1',
    });
    expect(doc<TransactionsFile>(r, paths.tx).entries[0]).toMatchObject({
      type: 'portal', teams: ['t1'], lines: ['Dan Draftee (Jr PF, 70) leaves the draft and enters the transfer portal from School One'],
    });
  });
  it('refuses a Senior and a started draft', () => {
    expect(problems(draftToPortal(draftBoardState(), 'p00001', ctx))).toEqual(["Seniors can't enter the transfer portal"]);
    expect(problems(draftToPortal(started(), 'p00034', ctx))).toEqual(['The S80 draft has started']);
  });
  it('leaves the input state untouched', () => {
    const s = draftBoardState();
    ok(draftToPortal(s, 'p00034', ctx));
    expect(s.board).toEqual(draftBoardBoard());
    expect(s.draft).toEqual(draftBoardDraft());
  });
});

describe('setProspectRating', () => {
  it('writes only the draft', () => {
    const r = ok(setProspectRating(draftBoardState(), 'p00035', 71));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft]);
    expect(doc<DraftFile>(r, paths.draft).prospects.find(p => p.playerId === 'p00035')?.fbaRating).toBe(71);
    expect(r.label).toBe('Eve Early: FBA rating 71');
  });
  it('waits for the pro reset', () => {
    expect(problems(setProspectRating(draftBoardState({ ratings: null }), 'p00035', 71))).toEqual(['Finish the pro ratings reset first']);
    const open = draftBoardState();
    expect(problems(setProspectRating({ ...open, ratings: { ...open.ratings!, locked: false } }, 'p00035', 71))).toEqual(['Finish the pro ratings reset first']);
  });
  it('refuses a prospect rated in the reset', () => {
    expect(problems(setProspectRating(draftBoardState(), 'p00034', 71))).toEqual(['Dan Draftee was rated in the pro reset']);
  });
  it('refuses values outside 1-99 or not whole', () => {
    for (const v of [0, 100, 70.5, NaN]) expect(problems(setProspectRating(draftBoardState(), 'p00035', v))).toEqual(['Enter a whole number from 1 to 99']);
    ok(setProspectRating(draftBoardState(), 'p00035', 1));
    ok(setProspectRating(draftBoardState(), 'p00035', 99));
  });
  it('refuses a stranger and a started draft', () => {
    expect(problems(setProspectRating(draftBoardState(), 'p00003', 71))).toEqual(["Cal Center isn't on the draft board"]);
    expect(problems(setProspectRating(started(), 'p00035', 71))).toEqual(['The S80 draft has started']);
  });
});

describe('boardOrder', () => {
  it('puts the pro-reset ranking first, then the rest by ratings and name', () => {
    expect(boardOrder(draftBoardState()).map(p => p.playerId)).toEqual(['p00034', 'p00001', 'p00036', 'p00035']);
  });
  it('orders unranked prospects by FBA rating, then college rating, then name, nulls last', () => {
    const base = draftBoardDraft();
    const mk = (playerId: string, fbaRating: number | null, collegeRating: number | null) =>
      ({ ...base.prospects[2], playerId, fbaRating, collegeRating });
    const draft = {
      ...base,
      prospects: [
        mk('p00035', null, 70), // Eve
        mk('p00036', null, null), // Tim
        mk('p00034', 50, 60), // Dan
        mk('p00001', 50, 60), // Sam: ties Dan, so name order
        mk('p00003', 50, 65), // Cal
        mk('p00010', 80, null), // Rick
      ],
    };
    expect(boardOrder(draftBoardState({ draft, ratings: null })).map(p => p.playerId)).toEqual(
      ['p00010', 'p00003', 'p00034', 'p00001', 'p00035', 'p00036'],
    );
  });
});
