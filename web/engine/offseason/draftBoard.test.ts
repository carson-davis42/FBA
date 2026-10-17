import { describe, expect, it } from 'vitest';
import type { DraftFile, PlayersFile, RecruitingFile, RostersFile, TransactionsFile } from '../shared/types';
import { backToSchool, boardOrder, declare, declareCandidates, draftBoardProblem, draftToPortal, enterPortal, moveProspectRank } from './draftBoard';
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
  it('lists named So/Jr/Sr on the rosters, by school then position, without X, Fr, or board players', () => {
    expect(declareCandidates(draftBoardState()).map(c => [c.playerId, c.teamId, c.position, c.rating])).toEqual([
      ['p00031', 't1', 'SG', 70],
      ['p00003', 't1', 'C', 74],
      ['p00033', 't2', 'SF', 61],
    ]);
  });
  it('shows the class they were in last season, not the one Adjust Age moved them into', () => {
    expect(declareCandidates(draftBoardState()).map(c => [c.playerId, c.classYear, c.rosterYear])).toEqual([
      ['p00031', 'Fr', 'So'],
      ['p00003', 'So', 'Jr'],
      ['p00033', 'Fr', 'So'],
    ]);
  });
});

describe('declare', () => {
  it('opens his slot, adds the prospect and logs a declare', () => {
    const r = ok(declare(draftBoardState(), 'p00003', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft, paths.rosters, paths.tx, 'players.json']);
    expect(r.label).toBe('Cal Center declares for the draft');
    expect(doc<DraftFile>(r, paths.draft).prospects.at(-1)).toEqual({
      playerId: 'p00003', position: 'C', college: 't1', classYear: 'So', senior: false, collegeRating: 74, stars: 3, fbaRating: null,
    });
    expect(doc<RostersFile>(r, paths.rosters).teams.t1[4]).toEqual({ playerId: null, position: 'C', rating: null, age: null, points: 0, stars: null, classYear: null });
    expect(doc<TransactionsFile>(r, paths.tx).entries).toEqual([
      { seq: 1, batchId: 'b1', type: 'declare', teams: ['t1'], lines: ['Cal Center (So C, School One) declares for the S80 draft'] },
    ]);
  });
  it('fills a missing birth season from his class year (So 19, Jr 20), and keeps an existing one', () => {
    const jr = ok(declare(draftBoardState(), 'p00003', ctx));
    expect(doc<PlayersFile>(jr, 'players.json').players.p00003.birthSeason).toBe(60);
    const so = ok(declare(draftBoardState(), 'p00031', ctx));
    expect(doc<PlayersFile>(so, 'players.json').players.p00031.birthSeason).toBe(61);
    expect(Object.keys(doc<PlayersFile>(so, 'players.json').players)).toEqual(Object.keys(draftBoardState().players.players));

    const players = draftBoardState().players;
    players.players.p00003 = { ...players.players.p00003, birthSeason: 55 };
    const kept = ok(declare(draftBoardState({ players }), 'p00003', ctx));
    expect(kept.writes.map(w => w.path)).toEqual([paths.draft, paths.rosters, paths.tx]);
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
    // He was a Jr last season, so he returns as a Sr.
    expect(doc<RostersFile>(r, paths.rosters).teams.t1[3]).toEqual({ playerId: 'p00034', position: 'PF', rating: 70, age: null, points: 0, stars: 3, classYear: 'Sr' });
    expect(doc<TransactionsFile>(r, paths.tx).entries[0]).toMatchObject({ type: 'declare', teams: ['t1'], lines: ['Dan Draftee returns to School One'] });
    expect(r.label).toBe('Dan Draftee returns to School One');
  });
  it('sends him to the portal when his slot is taken', () => {
    const r = ok(backToSchool(draftBoardState(), 'p00036', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft, paths.board, paths.tx]);
    expect(doc<DraftFile>(r, paths.draft).prospects.map(p => p.playerId)).not.toContain('p00036');
    expect(doc<RecruitingFile>(r, paths.board).portal.at(-1)).toEqual({
      playerId: 'p00036', position: 'SG', classYear: 'Sr', rating: 72, stars: 3, projections: {}, committedTo: null, fromTeam: 't1',
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

describe('enterPortal', () => {
  it('opens his slot, puts him in the portal and logs it, without touching the draft', () => {
    const r = ok(enterPortal(draftBoardState(), 'p00003', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.rosters, paths.board, paths.tx]);
    expect(r.label).toBe('Cal Center enters the transfer portal');
    expect(doc<RostersFile>(r, paths.rosters).teams.t1[4]).toEqual({ playerId: null, position: 'C', rating: null, age: null, points: 0, stars: null, classYear: null });
    expect(doc<RecruitingFile>(r, paths.board).portal.at(-1)).toEqual({
      playerId: 'p00003', position: 'C', classYear: 'Jr', rating: 74, stars: 3, projections: {}, committedTo: null, fromTeam: 't1',
    });
    expect(doc<TransactionsFile>(r, paths.tx).entries[0]).toMatchObject({
      type: 'portal', teams: ['t1'], lines: ['Cal Center (So C, 74) leaves School One and enters the transfer portal'],
    });
  });
  it('refuses a non-candidate (a prospect, a freshman) and a started draft', () => {
    expect(problems(enterPortal(draftBoardState(), 'p00034', ctx))).toEqual(["Dan Draftee can't enter the portal from here"]);
    expect(problems(enterPortal(started(), 'p00003', ctx))).toEqual(['The S80 draft has started']);
  });
  it('leaves the input state untouched', () => {
    const s = draftBoardState();
    ok(enterPortal(s, 'p00003', ctx));
    expect(s.board).toEqual(draftBoardBoard());
  });
});

describe('draftToPortal', () => {
  it('moves him to the portal and logs it', () => {
    const r = ok(draftToPortal(draftBoardState(), 'p00034', ctx));
    expect(r.writes.map(w => w.path)).toEqual([paths.draft, paths.board, paths.tx]);
    expect(doc<DraftFile>(r, paths.draft).prospects.map(p => p.playerId)).toEqual(['p00001', 'p00035', 'p00036']);
    expect(doc<RecruitingFile>(r, paths.board).portal.at(-1)).toEqual({
      playerId: 'p00034', position: 'PF', classYear: 'Sr', rating: 70, stars: 3, projections: {}, committedTo: null, fromTeam: 't1',
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

describe('boardOrder', () => {
  it('orders by college rating plus the class boost, then name, nulls last, and ignores any FBA rating', () => {
    const base = draftBoardDraft();
    const mk = (playerId: string, fbaRating: number | null, collegeRating: number | null) =>
      ({ ...base.prospects[2], playerId, classYear: 'Sr' as const, fbaRating, collegeRating });
    const draft = {
      ...base,
      prospects: [
        mk('p00035', null, 70), // Eve
        mk('p00036', null, null), // Tim
        mk('p00034', 99, 60), // Dan: a high FBA rating counts for nothing
        mk('p00001', 1, 60), // Sam: ties Dan, so name order
        mk('p00003', 50, 65), // Cal
      ],
    };
    expect(boardOrder(draftBoardState({ draft })).map(p => p.playerId)).toEqual(['p00035', 'p00003', 'p00034', 'p00001', 'p00036']);
  });
});

describe('boardOrder class boost', () => {
  const prospect = (playerId: string, classYear: 'Fr' | 'So' | 'Jr' | 'Sr', collegeRating: number, fbaRating: number | null) => ({
    playerId, position: 'PG' as const, college: 't1', classYear, senior: classYear === 'Sr', collegeRating, stars: null, fbaRating,
  });
  const order = (prospects: DraftFile['prospects']) =>
    boardOrder(draftBoardState({ draft: { ...draftBoardDraft(), prospects } })).map(p => p.playerId);
  it('puts a freshman ahead of a junior with a slightly higher college rating (85 + 4 against 87 + 1)', () => {
    expect(order([prospect('pJr', 'Jr', 87, null), prospect('pFr', 'Fr', 85, null)])).toEqual(['pFr', 'pJr']);
  });
  it('boosts a sophomore by 2 and leaves a senior as is', () => {
    expect(order([prospect('pSr', 'Sr', 87, null), prospect('pSo', 'So', 86, null)])).toEqual(['pSo', 'pSr']);
    expect(order([prospect('pSr', 'Sr', 87, null), prospect('pSo', 'So', 84, null)])).toEqual(['pSr', 'pSo']);
  });
  it('still goes by rating in the same class', () => {
    expect(order([prospect('pA', 'So', 85, null), prospect('pB', 'So', 87, null)])).toEqual(['pB', 'pA']);
  });
});

describe('moveProspectRank', () => {
  // Boosted scores: Sam Senior 80, Tim Taken 73, Dan Draftee 71, Eve Early 70: ranking p00001, p00036, p00034, p00035.
  const order = (r: { writes: { path: string; doc: unknown }[] }) => (r.writes[0].doc as DraftFile).rankOrder;
  it('swaps a prospect with the one above or below him and saves the whole ranking in the draft', () => {
    const up = ok(moveProspectRank(draftBoardState(), 'p00035', -1));
    expect(up.writes.map(w => w.path)).toEqual([paths.draft]);
    expect(order(up)).toEqual(['p00001', 'p00036', 'p00035', 'p00034']);
    expect(up.label).toBe('Eve Early moves up the rankings');
    const down = ok(moveProspectRank(draftBoardState(), 'p00001', 1));
    expect(order(down)).toEqual(['p00036', 'p00001', 'p00034', 'p00035']);
  });
  it('builds on a saved manual order', () => {
    const first = ok(moveProspectRank(draftBoardState(), 'p00035', -1));
    const again = ok(moveProspectRank(draftBoardState({ draft: first.writes[0].doc as DraftFile }), 'p00035', -1));
    expect(order(again)).toEqual(['p00001', 'p00035', 'p00036', 'p00034']);
  });
  it('with a filter, swaps with the nearest prospect it shows', () => {
    const visible = (id: string) => id === 'p00001' || id === 'p00035';
    expect(order(ok(moveProspectRank(draftBoardState(), 'p00035', -1, visible)))).toEqual(['p00035', 'p00036', 'p00034', 'p00001']);
  });
  it('refuses the top going up, the bottom going down, a stranger and a started draft', () => {
    expect(problems(moveProspectRank(draftBoardState(), 'p00001', -1))).toEqual(['Sam Senior is already at the top of the rankings']);
    expect(problems(moveProspectRank(draftBoardState(), 'p00035', 1))).toEqual(['Eve Early is already at the bottom of the rankings']);
    expect(problems(moveProspectRank(draftBoardState(), 'p00003', -1))).toEqual(["Cal Center isn't on the draft board"]);
    expect(problems(moveProspectRank(started(), 'p00034', -1))).toEqual(['The S80 draft has started']);
  });
  it('leaves the input state untouched', () => {
    const s = draftBoardState();
    ok(moveProspectRank(s, 'p00035', -1));
    expect(s.draft).toEqual(draftBoardDraft());
  });
});
