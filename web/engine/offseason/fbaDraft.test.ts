import { describe, expect, it } from 'vitest';
import { DraftFile as DraftFileSchema, type DraftFile, type FreeAgentsFile, type RostersFile, type TransactionsFile } from '../shared/types';
import {
  draftPick, draftStepId, finishDraft, finishDraftProblems, onTheClock, startDraft, startDraftProblems, type FbaDraftState,
} from './fbaDraft';
import { fbaDraftState as baseState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok, got ${(r as unknown as { problems: string[] }).problems.join('; ')}`);
  return r as Extract<T, { ok: true }>;
};
const problems = (r: { ok: boolean }) => (r.ok ? [] : (r as unknown as { problems: string[] }).problems);
const doc = <T>(r: Extract<ReturnType<typeof startDraft>, { ok: true }>, path: string) => r.writes.find(w => w.path === path)!.doc as T;

const started = (s: FbaDraftState = baseState()): FbaDraftState => ({ ...s, draft: doc<DraftFile>(ok(startDraft(s, ctx)), 'leagues/fba/S80/draft.json') });
/** Applies a pick to the state the way the page does. */
const pick = (s: FbaDraftState, id: string): FbaDraftState => {
  const w = ok(draftPick(s, id, ctx)).writes;
  return {
    ...s,
    draft: w.find(x => x.path === 'leagues/fba/S80/draft.json')!.doc as DraftFile,
    fba: w.find(x => x.path === 'leagues/fba/S80/rosters.json')!.doc as RostersFile,
    tx: w.find(x => x.path === 'leagues/fba/S80/transactions.json')!.doc as TransactionsFile,
  };
};
const pid = (i: number) => `p${String(40 + i).padStart(5, '0')}`;
/** A started draft with only ten picks, all made (prospects A-J); K and L are undrafted. */
const tenPicks = (): FbaDraftState => {
  let s = started();
  s = { ...s, draft: { ...s.draft, picks: s.draft.picks.slice(0, 10) } };
  for (let i = 0; i < 10; i++) s = pick(s, pid(i));
  return s;
};
/** A started draft where all twelve prospects are drafted (picks 1-12) and picks 13-30 are still empty. */
const allDrafted = (): FbaDraftState => {
  let s = started();
  for (let i = 0; i < 12; i++) s = pick(s, pid(i));
  return s;
};
const withoutStep = (s: FbaDraftState): FbaDraftState => ({ ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 's80-fba-draft' ? { ...x, done: true } : x)) } });

describe('draftStepId', () => {
  it('names the calendar step', () => expect(draftStepId(80)).toBe('s80-fba-draft'));
});

describe('startDraftProblems', () => {
  it('has none when the step is current, the reset is finished, everyone is rated and the lottery is drawn', () => {
    expect(startDraftProblems(baseState())).toEqual([]);
  });

  it('gives the calendar problem first', () => {
    expect(startDraftProblems(withoutStep(baseState()))[0]).toBe('The draft starts at the S80 FBA Draft step (current step: Free Agency/Offseason)');
  });

  it('wants the pro ratings reset finished (missing or unlocked)', () => {
    const s = baseState();
    expect(startDraftProblems({ ...s, ratings: null })).toEqual(['Finish the pro ratings reset first']);
    expect(startDraftProblems({ ...s, ratings: { ...s.ratings!, locked: false } })).toEqual(['Finish the pro ratings reset first']);
  });

  it('names each unrated prospect', () => {
    const s = baseState();
    const prospects = s.draft.prospects.map(p => (['p00041', 'p00043'].includes(p.playerId) ? { ...p, fbaRating: null } : p));
    expect(startDraftProblems({ ...s, draft: { ...s.draft, prospects } })).toEqual(['Prospect B has no FBA rating', 'Prospect D has no FBA rating']);
  });

  it("wants last season's lottery drawn (missing or unlocked)", () => {
    const s = baseState();
    expect(startDraftProblems({ ...s, lottery: null })).toEqual(["The S79 draft lottery hasn't been drawn"]);
    expect(startDraftProblems({ ...s, lottery: { ...s.lottery!, locked: false } })).toEqual(["The S79 draft lottery hasn't been drawn"]);
  });

  it("refuses a lottery that is for another season's draft", () => {
    const s = baseState();
    expect(startDraftProblems({ ...s, lottery: { ...s.lottery!, draftSeason: 81 } })).toEqual(['The S79 lottery is for the S81 draft']);
  });

  it('refuses a draft that has already started', () => {
    expect(startDraftProblems(started())).toEqual(['The draft has already started']);
  });

  it('lists the problems in order', () => {
    const s = baseState();
    const prospects = s.draft.prospects.map((p, i) => (i === 0 ? { ...p, fbaRating: null } : p));
    expect(startDraftProblems(withoutStep({ ...s, ratings: null, lottery: null, draft: { ...s.draft, prospects, started: true } }))).toEqual([
      'The draft starts at the S80 FBA Draft step (current step: Free Agency/Offseason)',
      'Finish the pro ratings reset first',
      'Prospect A has no FBA rating',
      "The S79 draft lottery hasn't been drawn",
      'The draft has already started',
    ]);
  });
});

describe('startDraft', () => {
  it('lists the picks from the lottery in slot order with no player, and marks the draft started', () => {
    const w = ok(startDraft(baseState(), ctx));
    const d = doc<DraftFile>(w, 'leagues/fba/S80/draft.json');
    expect(d.started).toBe(true);
    expect(d.locked).toBe(false);
    expect(d.picks).toHaveLength(30);
    expect(d.picks.map(p => p.slot)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(d.picks[0]).toEqual({ slot: 1, owner: 'T29', originalTeam: 'T29', playerId: null });
    expect(d.picks[2]).toEqual({ slot: 3, owner: 'T05', originalTeam: 'T27', playerId: null });
    expect(d.prospects).toHaveLength(12);
    expect(DraftFileSchema.safeParse(d).success).toBe(true);
  });

  it('logs a drafted transaction', () => {
    const tx = doc<TransactionsFile>(ok(startDraft(baseState(), ctx)), 'leagues/fba/S80/transactions.json');
    expect(tx.entries).toEqual([{ seq: 1, batchId: 'b1', type: 'drafted', teams: [], lines: ['The S80 draft starts: 30 picks, 12 prospects'] }]);
  });

  it('writes only the draft and the transactions', () => {
    expect(ok(startDraft(baseState(), ctx)).writes.map(w => w.path)).toEqual(['leagues/fba/S80/draft.json', 'leagues/fba/S80/transactions.json']);
  });

  it('refuses while a start problem stands', () => {
    expect(problems(startDraft({ ...baseState(), lottery: null }, ctx))).toEqual(["The S79 draft lottery hasn't been drawn"]);
  });
});

describe('onTheClock', () => {
  it('is the first pick with no player, or null', () => {
    expect(onTheClock(baseState().draft)).toBeNull();
    const s = started();
    expect(onTheClock(s.draft)?.slot).toBe(1);
    const s2 = pick(pick(s, 'p00040'), 'p00041');
    expect(onTheClock(s2.draft)?.slot).toBe(3);
    const full = { ...s.draft, picks: s.draft.picks.map(p => ({ ...p, playerId: 'p00040' })) };
    expect(onTheClock(full)).toBeNull();
  });
});

describe('draftPick', () => {
  it("sets the pick's player", () => {
    const d = doc<DraftFile>(ok(draftPick(started(), 'p00042', ctx)), 'leagues/fba/S80/draft.json');
    expect(d.picks[0]).toEqual({ slot: 1, owner: 'T29', originalTeam: 'T29', playerId: 'p00042' });
    expect(d.picks[1].playerId).toBeNull();
    expect(DraftFileSchema.safeParse(d).success).toBe(true);
  });

  it('adds the rookie to the owner on the rookie deal', () => {
    const r = doc<RostersFile>(ok(draftPick(started(), 'p00041', ctx)), 'leagues/fba/S80/rosters.json');
    expect(r.teams.T29).toEqual([{ playerId: 'p00041', position: 'SG', rating: 79, age: 19, points: 0, contractEnd: 81, contractAmount: 2, restricted: true }]);
  });

  it('adds the rookie even when the owner already has five players', () => {
    let s = started();
    s = pick(pick(s, 'p00040'), 'p00041');
    const r = doc<RostersFile>(ok(draftPick(s, 'p00042', ctx)), 'leagues/fba/S80/rosters.json');
    expect(r.teams.T05).toHaveLength(6);
    expect(r.teams.T05[5]).toMatchObject({ playerId: 'p00042', position: 'C', rating: 78, age: 19, restricted: true });
    expect(r.teams.T27).toEqual([]);
  });

  it('leaves the age unknown when the birth season is', () => {
    const s = started();
    const players = { ...s.players, players: { ...s.players.players, p00040: { ...s.players.players.p00040, birthSeason: null } } };
    const r = doc<RostersFile>(ok(draftPick({ ...s, players }, 'p00040', ctx)), 'leagues/fba/S80/rosters.json');
    expect(r.teams.T29[0].age).toBeNull();
  });

  it('logs the pick and labels it', () => {
    let s = started();
    s = pick(pick(s, 'p00040'), 'p00041');
    const w = ok(draftPick(s, 'p00042', ctx));
    const tx = doc<TransactionsFile>(w, 'leagues/fba/S80/transactions.json');
    expect(tx.entries.at(-1)).toEqual({ seq: 3, batchId: 'b1', type: 'drafted', teams: ['T05'], lines: ['S80 Draft #3: City 05 selects Prospect C (C, School One)'] });
    expect(w.label).toBe('#3: City 05 selects Prospect C');
  });

  it('writes the draft, the rosters and the transactions', () => {
    expect(ok(draftPick(started(), 'p00040', ctx)).writes.map(w => w.path))
      .toEqual(['leagues/fba/S80/draft.json', 'leagues/fba/S80/rosters.json', 'leagues/fba/S80/transactions.json']);
  });

  it('refuses before the start, after the finish, a repeat and a non-prospect', () => {
    expect(problems(draftPick(baseState(), 'p00040', ctx))).toEqual(["The draft hasn't started"]);
    const s = started();
    expect(problems(draftPick({ ...s, draft: { ...s.draft, locked: true } }, 'p00040', ctx))).toEqual(['The draft is finished']);
    expect(problems(draftPick(pick(s, 'p00040'), 'p00040', ctx))).toEqual(['Prospect A has already been drafted']);
    expect(problems(draftPick(s, 'p00020', ctx))).toEqual(["p00020 isn't a prospect"]);
  });

  it('refuses away from the draft step', () => {
    expect(problems(draftPick(withoutStep(started()), 'p00040', ctx)))
      .toEqual(['The draft starts at the S80 FBA Draft step (current step: Free Agency/Offseason)']);
  });

  it('refuses when no pick is left', () => {
    const s = started();
    const full = { ...s, draft: { ...s.draft, picks: s.draft.picks.map(p => ({ ...p, playerId: 'p00040' })) } };
    expect(problems(draftPick(full, 'p00041', ctx))).toEqual(['No pick is on the clock']);
  });
});

describe('finishDraftProblems', () => {
  it('wants the draft started', () => {
    expect(finishDraftProblems(baseState())).toEqual(["The draft hasn't started"]);
  });

  it('counts the picks still to be made while prospects remain', () => {
    expect(finishDraftProblems(started())).toEqual(['30 picks are still to be made']);
    expect(finishDraftProblems(pick(started(), 'p00040'))).toEqual(['29 picks are still to be made']);
  });

  it('says "1 pick is" for a single pick', () => {
    const s = started();
    const nearly = { ...s, draft: { ...s.draft, picks: s.draft.picks.map(p => (p.slot === 30 ? p : { ...p, playerId: pid(0) })) } };
    expect(finishDraftProblems(nearly)).toEqual(['1 pick is still to be made']);
  });

  it('has none when picks remain but no prospects do', () => {
    expect(finishDraftProblems(allDrafted())).toEqual([]);
  });

  it('has none when every pick is made and prospects remain', () => {
    expect(finishDraftProblems(tenPicks())).toEqual([]);
  });

  it('refuses a finished draft', () => {
    const s = allDrafted();
    expect(finishDraftProblems({ ...s, draft: { ...s.draft, locked: true } })).toEqual(['The draft is finished']);
  });
});

describe('finishDraft', () => {
  it('refuses while picks are still to be made', () => {
    expect(problems(finishDraft(started(), ctx))).toEqual(['30 picks are still to be made']);
  });

  it('refuses out of calendar order', () => {
    expect(problems(finishDraft(withoutStep(tenPicks()), ctx))).toEqual(['The draft is finished at the S80 FBA Draft step (current step: Free Agency/Offseason)']);
  });

  it('sends the undrafted prospects to free agency as rookies', () => {
    const fa = doc<FreeAgentsFile>(ok(finishDraft(tenPicks(), ctx)), 'leagues/fba/S80/freeAgents.json');
    expect(fa.players).toEqual([
      { playerId: 'p00050', position: 'C', age: 19, rating: 70, rookie: true, note: 'Undrafted' },
      { playerId: 'p00051', position: 'SG', age: 19, rating: 69, rookie: true, note: 'Undrafted' },
    ]);
  });

  it('adds to the free agents already there', () => {
    const s = tenPicks();
    const existing = { playerId: 'p00021', position: 'C' as const, age: 21, rating: 60, rookie: false, note: '' };
    const fa = doc<FreeAgentsFile>(ok(finishDraft({ ...s, freeAgents: { ...s.freeAgents, players: [existing] } }, ctx)), 'leagues/fba/S80/freeAgents.json');
    expect(fa.players).toHaveLength(3);
    expect(fa.players[0]).toEqual(existing);
  });

  it('locks the draft and marks the step done', () => {
    const w = ok(finishDraft(tenPicks(), ctx));
    const d = doc<DraftFile>(w, 'leagues/fba/S80/draft.json');
    expect(d.locked).toBe(true);
    expect(DraftFileSchema.safeParse(d).success).toBe(true);
    const cal = doc<{ steps: { id: string; done: boolean }[] }>(w, 'calendar.json');
    expect(cal.steps.find(s => s.id === 's80-fba-draft')!.done).toBe(true);
  });

  it('logs the finish', () => {
    const tx = doc<TransactionsFile>(ok(finishDraft(tenPicks(), ctx)), 'leagues/fba/S80/transactions.json');
    expect(tx.entries.at(-1)).toEqual({
      seq: 11, batchId: 'b1', type: 'drafted', teams: [], lines: ['The S80 draft is finished: 2 undrafted prospects join free agency'],
    });
  });

  it('logs one undrafted prospect in the singular', () => {
    const s = tenPicks();
    const one = { ...s, draft: { ...s.draft, prospects: s.draft.prospects.slice(0, 11) } };
    const tx = doc<TransactionsFile>(ok(finishDraft(one, ctx)), 'leagues/fba/S80/transactions.json');
    expect(tx.entries.at(-1)!.lines[0]).toBe('The S80 draft is finished: 1 undrafted prospect joins free agency');
  });

  it('adds a line for each empty pick when every prospect is gone', () => {
    const tx = doc<TransactionsFile>(ok(finishDraft(allDrafted(), ctx)), 'leagues/fba/S80/transactions.json');
    const lines = tx.entries.at(-1)!.lines;
    expect(lines).toHaveLength(19);
    expect(lines[0]).toBe('The S80 draft is finished: 0 undrafted prospects join free agency');
    expect(lines[1]).toBe('#13: City 17 makes no selection');
    expect(lines[18]).toBe('#30: City 00 makes no selection');
    expect(doc<FreeAgentsFile>(ok(finishDraft(allDrafted(), ctx)), 'leagues/fba/S80/freeAgents.json').players).toEqual([]);
  });

  it('writes the draft, free agents, calendar and transactions', () => {
    expect(ok(finishDraft(tenPicks(), ctx)).writes.map(w => w.path))
      .toEqual(['leagues/fba/S80/draft.json', 'leagues/fba/S80/freeAgents.json', 'calendar.json', 'leagues/fba/S80/transactions.json']);
  });
});
