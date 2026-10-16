import { describe, expect, it } from 'vitest';
import type { WritesResult } from '../season/moves';
import { expansionDraftStepId } from '../shared/expansion';
import { schemaForPath } from '../shared/schemaRegistry';
import { DraftHistoryFile, ExpansionFile, type Position, type RosterEntry } from '../shared/types';
import { normalizeRoster } from '../roster/rules';
import {
  expansionOrder, expansionPick, expansionPath, exposedPlayers, finishExpansion, lockProtections, onTheClock, pickProblems, setProtections,
  startExpansion, unlockProtections, type ExpansionState,
} from './expansion';
import { expansionState, expansionTeamIds } from './testFixtures';

const ctx = { batchId: 'b1' };
const POS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
/** The fixture's player id for a team and position (A PG = p10001 ... H C = p10040). */
const pid = (team: string, pos: Position) => `p${String(10000 + expansionTeamIds.indexOf(team) * 5 + POS.indexOf(pos) + 1).padStart(5, '0')}`;

const problemsOf = (r: WritesResult): string[] => (r.ok ? [] : r.problems);

/** Applies a move's writes to the state, as the app would after saving. */
function apply(state: ExpansionState, r: WritesResult): ExpansionState {
  if (!r.ok) throw new Error(`move refused: ${r.problems.join('; ')}`);
  const next = { ...state };
  for (const w of r.writes) {
    if (w.path === expansionPath(state.season)) next.expansion = w.doc as ExpansionFile;
    else if (w.path === `leagues/fba/S${state.season}/rosters.json`) next.fba = w.doc as ExpansionState['fba'];
    else if (w.path === `leagues/fba/S${state.season}/transactions.json`) next.tx = w.doc as ExpansionState['tx'];
    else if (w.path === 'leagues/fba/draftHistory.json') next.history = w.doc as ExpansionState['history'];
    else if (w.path === 'calendar.json') next.calendar = w.doc as ExpansionState['calendar'];
    else throw new Error(`unexpected write ${w.path}`);
  }
  return next;
}

const started = (over: Partial<ExpansionState> = {}) => {
  const s = expansionState(over);
  return apply(s, startExpansion(s, ctx));
};
const drafting = (over: Partial<ExpansionState> = {}) => {
  const s = started(over);
  return apply(s, lockProtections(s, ctx));
};

/** PHI and LAL snake order: PHI, LAL, LAL, PHI, PHI, LAL, LAL, PHI. One donor team and one distinct position per taker each time. */
const FULL_DRAFT: [string, Position][] = [
  ['A', 'PG'], ['B', 'PG'], ['C', 'SG'], ['D', 'SG'], ['E', 'SF'], ['F', 'SF'], ['G', 'PF'], ['H', 'PF'],
];
function pickAll(state: ExpansionState, upTo = FULL_DRAFT.length): ExpansionState {
  let s = state;
  for (const [team, pos] of FULL_DRAFT.slice(0, upTo)) s = apply(s, expansionPick(s, pid(team, pos), ctx));
  return s;
}

/** Every roster entry's C is restricted, so protecting the other four exposes nobody. */
const allCRestricted = () => {
  const base = expansionState();
  const teams = Object.fromEntries(Object.entries(base.fba.teams).map(([t, es]) => [
    t, es.map(e => (e.position === 'C' && e.playerId ? { ...e, restricted: true } : e)),
  ]));
  return { ...base.fba, teams };
};

describe('expansionOrder', () => {
  it('orders the picks as a snake', () => {
    expect(expansionOrder(['PHI', 'LAL'], 4)).toEqual(['PHI', 'LAL', 'LAL', 'PHI', 'PHI', 'LAL', 'LAL', 'PHI']);
  });
  it('defaults to four picks each', () => {
    expect(expansionOrder(['PHI', 'LAL'])).toHaveLength(8);
  });
});

describe('startExpansion', () => {
  it('starts with an empty protect phase for the joining teams only', () => {
    const s = expansionState();
    const r = startExpansion(s, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = r.writes.find(w => w.path === 'leagues/fba/S80/expansion.json')!.doc as ExpansionFile;
    expect(doc).toEqual({
      league: 'fba', season: 80, phase: 'protect', protections: {},
      order: ['PHI', 'LAL', 'LAL', 'PHI', 'PHI', 'LAL', 'LAL', 'PHI'], picks: [],
    });
    const tx = r.writes.find(w => w.path === 'leagues/fba/S80/transactions.json')!.doc as ExpansionState['tx'];
    expect(tx.entries).toHaveLength(1);
    expect(tx.entries[0]).toMatchObject({ type: 'expansion', teams: ['PHI', 'LAL'], lines: ['The S80 expansion draft starts: 8 picks'] });
    expect(r.writes).toHaveLength(2);
  });

  it('refuses start with no joining teams, off-step, or when already started', () => {
    const base = expansionState();
    const noJoin = expansionState({ teams: { ...base.teams, teams: base.teams.teams.filter(t => t.fromSeason === undefined) } });
    expect(problemsOf(startExpansion(noJoin, ctx)).join(' ')).toMatch(/No team joins in S80/);

    const offStep = expansionState({ calendar: { ...base.calendar, steps: base.calendar.steps.map(s => ({ ...s, done: false })) } });
    expect(problemsOf(startExpansion(offStep, ctx)).join(' ')).toMatch(/The expansion draft starts at the/);

    const again = problemsOf(startExpansion(started(), ctx));
    expect(again).toContain('The expansion draft has already started');
  });
});

describe('setProtections', () => {
  it('accepts 4, refuses 5, refuses another team’s player, refuses a restricted player, refuses duplicates', () => {
    const s = started();
    const four = [pid('A', 'PG'), pid('A', 'SG'), pid('A', 'SF'), pid('A', 'PF')];
    const ok = setProtections(s, 'A', four, ctx);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.writes).toHaveLength(1);
      expect((ok.writes[0].doc as ExpansionFile).protections).toEqual({ A: four });
    }

    // B has no restricted player: five ids are one too many.
    const five = POS.map(p => pid('B', p));
    expect(problemsOf(setProtections(s, 'B', five, ctx)).join(' ')).toMatch(/at most 4/);

    expect(problemsOf(setProtections(s, 'A', [pid('B', 'PG')], ctx)).join(' ')).toMatch(/isn't on Team A/);
    expect(problemsOf(setProtections(s, 'A', [pid('A', 'C')], ctx)).join(' ')).toMatch(/A C has a restricted contract and is protected already/);
    expect(problemsOf(setProtections(s, 'A', [pid('A', 'PG'), pid('A', 'PG')], ctx)).join(' ')).toMatch(/twice/);
  });

  it('refuses an expansion team, a draft that has not started and locked protections; an empty list removes the key', () => {
    expect(problemsOf(setProtections(expansionState(), 'A', [], ctx))).toEqual(["The expansion draft hasn't started"]);
    expect(problemsOf(setProtections(started(), 'PHI', [], ctx)).join(' ')).toMatch(/isn't an existing team/);
    expect(problemsOf(setProtections(drafting(), 'A', [pid('A', 'PG')], ctx))).toEqual(['Protections are locked']);

    const s = apply(started(), setProtections(started(), 'A', [pid('A', 'PG')], ctx));
    const cleared = apply(s, setProtections(s, 'A', [], ctx));
    expect(cleared.expansion!.protections).toEqual({});
  });
});

describe('exposedPlayers', () => {
  it('excludes protected and restricted players and the expansion teams’ own players', () => {
    const s0 = started();
    const s = apply(s0, setProtections(s0, 'A', [pid('A', 'PG')], ctx));
    const ids = exposedPlayers(s).map(e => e.playerId);
    expect(ids).not.toContain(pid('A', 'PG'));
    for (const t of ['A', 'C', 'E', 'G']) expect(ids).not.toContain(pid(t, 'C'));
    expect(ids).toContain(pid('B', 'C'));
    expect(exposedPlayers(s).some(e => e.teamId === 'PHI' || e.teamId === 'LAL')).toBe(false);
    // 8 teams x 5 players, 4 restricted, 1 protected
    expect(ids).toHaveLength(40 - 4 - 1);
    expect(exposedPlayers(s).find(e => e.playerId === pid('B', 'SG'))).toEqual({
      playerId: pid('B', 'SG'), teamId: 'B', position: 'SG', rating: expect.any(Number), age: 25, contractAmount: 3, contractEnd: 82,
    });
  });

  it('is empty before the draft has started', () => {
    expect(exposedPlayers(expansionState())).toEqual([]);
  });
});

describe('lockProtections', () => {
  it('refuses when fewer players are exposed than picks (Review Focus 3)', () => {
    let s = started({ fba: allCRestricted() });
    for (const t of expansionTeamIds) {
      s = apply(s, setProtections(s, t, ['PG', 'SG', 'SF', 'PF'].map(p => pid(t, p as Position)), ctx));
    }
    expect(exposedPlayers(s)).toEqual([]);
    expect(problemsOf(lockProtections(s, ctx))).toEqual(['Only 0 teams have an exposed player; the draft needs 8. Lower some protections']);
  });

  it('counts exposed teams, not players: one team with an exposed player gives "1 team has"', () => {
    const base = expansionState();
    const restricted = allCRestricted();
    // H's C is free again.
    const fba = { ...restricted, teams: { ...restricted.teams, H: base.fba.teams.H } };
    let s = started({ fba });
    for (const t of expansionTeamIds) {
      s = apply(s, setProtections(s, t, ['PG', 'SG', 'SF', 'PF'].map(p => pid(t, p as Position)), ctx));
    }
    expect(problemsOf(lockProtections(s, ctx))).toEqual(['Only 1 team has an exposed player; the draft needs 8. Lower some protections']);
  });

  it('opens the draft phase when enough teams have exposed players, and only once', () => {
    const s = started();
    const r = lockProtections(s, ctx);
    expect(r.ok).toBe(true);
    const locked = apply(s, r);
    expect(locked.expansion!.phase).toBe('draft');
    expect(problemsOf(lockProtections(locked, ctx))).toEqual(['Protections are locked']);
    expect(problemsOf(lockProtections(expansionState(), ctx))).toEqual(["The expansion draft hasn't started"]);
  });
});

/** Every team protects all but its PG (a restricted C is exempt anyway): 8 donors expose one PG each, so one team can never get its second pick. */
const onlyPgsExposed = (s: ExpansionState): ExpansionState => {
  let t = s;
  for (const team of expansionTeamIds) {
    t = apply(t, setProtections(t, team, ['SG', 'SF', 'PF', 'C'].map(p => pid(team, p as Position)).filter(id => !t.fba.teams[team].find(e => e.playerId === id)?.restricted), ctx));
  }
  return t;
};

describe('lockProtections feasibility', () => {
  it('refuses when no legal sequence of 8 picks exists, though 8 teams expose a player', () => {
    const s = onlyPgsExposed(started());
    expect(exposedPlayers(s)).toHaveLength(8);
    const p = problemsOf(lockProtections(s, ctx));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/no legal sequence of 8 picks/i);
    expect(p[0]).toMatch(/lower/i);
  });

  it('accepts a feasible exposure', () => {
    expect(lockProtections(started(), ctx).ok).toBe(true);
  });

  it('refuses when the cap makes the picks impossible', () => {
    const base = expansionState();
    const teams = Object.fromEntries(Object.entries(base.fba.teams).map(([t, es]) => [
      t, expansionTeamIds.includes(t) ? es.map(e => ({ ...e, contractAmount: 9 })) : es,
    ]));
    // $9 each: four picks cost $36 > $25 for every expansion team.
    const s = started({ fba: { ...base.fba, teams } });
    expect(problemsOf(lockProtections(s, ctx))[0]).toMatch(/no legal sequence/i);
  });

  it('is fast with 30 exposed players that cannot work', () => {
    const base = expansionState();
    const mk = (t: string, i: number) => ({ playerId: `q${t}${i}`, position: 'PG' as Position, rating: 70, age: 25, points: 0, contractEnd: 82, contractAmount: 1 });
    const extra = Array.from({ length: 30 }, (_, i) => `X${i}`);
    const teams = { ...base.fba.teams };
    for (const [i, t] of extra.entries()) teams[t] = normalizeRoster([mk(t, i)], 'fba');
    const players = { ...base.players, players: { ...base.players.players } };
    for (const [i, t] of extra.entries()) players.players[`q${t}${i}`] = { id: `q${t}${i}`, name: t, birthSeason: 55 };
    const teamsFile = {
      ...base.teams,
      teams: [...base.teams.teams, ...extra.map(t => ({ teamId: t, name: t, abbr: t, group: 'E', logoFolder: null, badge: { bg: '#000', fg: '#fff' } }))],
    };
    // all 30 expose one PG and nothing else; the 8 original teams protect everyone.
    let s = started({ fba: { ...base.fba, teams }, players, teams: teamsFile });
    for (const t of expansionTeamIds) {
      s = apply(s, setProtections(s, t, ['PG', 'SG', 'SF', 'PF'].map(p => pid(t, p as Position)), ctx));
    }
    const t0 = performance.now();
    const r = lockProtections(s, ctx);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(problemsOf(r)[0]).toMatch(/no legal sequence/i);
  });
});

describe('unlockProtections', () => {
  it('goes back to the protect phase before the first pick', () => {
    const s = drafting();
    const r = unlockProtections(s, ctx);
    expect(r.ok).toBe(true);
    const next = apply(s, r);
    expect(next.expansion!.phase).toBe('protect');
    expect(lockProtections(next, ctx).ok).toBe(true);
  });
  it('refuses after a pick, in the protect phase, when not started, and when done', () => {
    const picked = pickAll(drafting(), 1);
    expect(problemsOf(unlockProtections(picked, ctx))).toHaveLength(1);
    expect(problemsOf(unlockProtections(started(), ctx))).toHaveLength(1);
    expect(problemsOf(unlockProtections(expansionState(), ctx))).toEqual(["The expansion draft hasn't started"]);
    const done = apply(pickAll(drafting()), finishExpansion(pickAll(drafting()), ctx));
    expect(problemsOf(unlockProtections(done, ctx))).toHaveLength(1);
  });
});

describe('stale protections', () => {
  it('drops protected ids that left the roster and does not count them', () => {
    const s0 = started();
    const four = ['PG', 'SG', 'SF', 'PF'].map(p => pid('A', p as Position));
    const s1 = apply(s0, setProtections(s0, 'A', four, ctx));
    // A's PG is traded away.
    const teams = { ...s1.fba.teams, A: s1.fba.teams.A.filter(e => e.playerId !== four[0]) };
    const s2 = { ...s1, fba: { ...s1.fba, teams } };
    const r = setProtections(s2, 'A', four, ctx);
    expect(r.ok).toBe(true);
    const s3 = apply(s2, r);
    expect(s3.expansion!.protections.A).toEqual(four.slice(1));
    // another team's player is still refused
    expect(problemsOf(setProtections(s2, 'A', [pid('B', 'PG')], ctx))[0]).toMatch(/isn't on/);
  });
});

describe('expansionPick', () => {
  it('moves the player with his contract and vacates the donor slot', () => {
    const s = drafting();
    expect(onTheClock(s.expansion!)).toBe('PHI');
    const r = expansionPick(s, pid('A', 'PG'), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.label).toBe('#1: Philly Phantoms selects A PG');
    const next = apply(s, r);

    expect(next.expansion!.picks).toEqual([{ n: 1, teamId: 'PHI', fromTeamId: 'A', playerId: pid('A', 'PG'), position: 'PG' }]);
    expect(onTheClock(next.expansion!)).toBe('LAL');

    const phi = next.fba.teams.PHI;
    expect(phi).toHaveLength(5);
    expect(phi[0]).toMatchObject({ playerId: pid('A', 'PG'), position: 'PG', contractAmount: 3, contractEnd: 82 });
    expect(phi.slice(1).every(e => e.playerId === null)).toBe(true);

    const donor = next.fba.teams.A;
    expect(donor).toHaveLength(5);
    expect(donor.some(e => e.playerId === pid('A', 'PG'))).toBe(false);
    expect(donor[0]).toMatchObject({ playerId: null, position: 'PG', rating: null, contractAmount: null });
    expect(donor[1].playerId).toBe(pid('A', 'SG'));

    const entry = next.tx.entries.at(-1)!;
    expect(entry).toMatchObject({ type: 'expansion', batchId: 'b1' });
    expect(entry.lines).toEqual(['S80 Expansion Draft #1: Philly Phantoms selects A PG (PG, from Team A)']);
  });

  it('keeps a restricted flag on the player who moves', () => {
    const base = expansionState();
    const teams = { ...base.fba.teams, A: base.fba.teams.A.map(e => (e.playerId === pid('A', 'PG') ? { ...e, restricted: true } : e)) };
    // restricted players are never exposed, so the flag cannot travel through a pick: confirm that.
    const s = drafting({ fba: { ...base.fba, teams } });
    expect(exposedPlayers(s).map(e => e.playerId)).not.toContain(pid('A', 'PG'));
  });

  it('a team that lost a player has no more exposed players (Review Focus 1)', () => {
    const s = drafting();
    expect(exposedPlayers(s).filter(e => e.teamId === 'A')).toHaveLength(4);
    const next = apply(s, expansionPick(s, pid('A', 'PG'), ctx));
    expect(exposedPlayers(next).filter(e => e.teamId === 'A')).toHaveLength(0);
    expect(pickProblems(next, pid('A', 'SG')).join(' ')).toMatch(/isn't available/);
    expect(problemsOf(expansionPick(next, pid('A', 'SG'), ctx))).toHaveLength(1);
  });

  it('refuses a position the expansion team already holds (Review Focus 2)', () => {
    const s = pickAll(drafting(), 3); // PHI A PG, LAL B PG, LAL C SG: PHI is on the clock again
    expect(onTheClock(s.expansion!)).toBe('PHI');
    expect(pickProblems(s, pid('D', 'PG'))).toEqual(['Philly Phantoms already has a PG']);
    expect(problemsOf(expansionPick(s, pid('D', 'PG'), ctx))).toEqual(['Philly Phantoms already has a PG']);
    expect(pickProblems(s, pid('D', 'SG'))).toEqual([]);
  });

  it('refuses a pick that takes payroll over the cap (Review Focus 2)', () => {
    const base = expansionState();
    const big: RosterEntry = { playerId: 'p10041', position: 'C', rating: 70, age: 25, points: 0, contractEnd: 82, contractAmount: 22 };
    const teams = {
      ...base.fba.teams,
      PHI: normalizeRoster([big], 'fba'),
      A: base.fba.teams.A.map(e => (e.playerId === pid('A', 'PG') ? { ...e, contractAmount: 4 } : e)),
    };
    const s = { ...drafting(), fba: { ...base.fba, teams } }; // set after locking: the lock would find this roster infeasible
    expect(pickProblems(s, pid('A', 'PG'))).toEqual(['Payroll would be $26 (cap $25)']);
    expect(problemsOf(expansionPick(s, pid('A', 'PG'), ctx))).toEqual(['Payroll would be $26 (cap $25)']);
    // A $3 player fits: 22 + 3 = 25.
    expect(pickProblems(s, pid('B', 'PG'))).toEqual([]);
    // An expired contract does not count.
    const expired = { ...base.fba, teams: { ...teams, A: teams.A.map(e => (e.playerId === pid('A', 'PG') ? { ...e, contractEnd: 79 } : e)) } };
    expect(pickProblems({ ...drafting(), fba: expired }, pid('A', 'PG'))).toEqual([]);
  });

  it('refuses picking out of turn data: not exposed, phase not draft, draft finished', () => {
    // protected and restricted players
    const s0 = started();
    const withProt = apply(s0, setProtections(s0, 'A', [pid('A', 'PG')], ctx));
    // phase 'protect': the draft is not open
    expect(pickProblems(withProt, pid('B', 'PG'))).toEqual(["The draft isn't open"]);
    expect(problemsOf(expansionPick(withProt, pid('B', 'PG'), ctx))).toEqual(["The draft isn't open"]);

    const d = apply(withProt, lockProtections(withProt, ctx));
    expect(pickProblems(d, pid('A', 'PG')).join(' ')).toMatch(/isn't available: protected, restricted/);
    expect(pickProblems(d, pid('A', 'C')).join(' ')).toMatch(/isn't available/);
    expect(pickProblems(d, 'p99999').join(' ')).toMatch(/isn't available/);
    expect(pickProblems(d, pid('B', 'PG'))).toEqual([]);

    // not started
    expect(pickProblems(expansionState(), pid('B', 'PG'))).toEqual(["The expansion draft hasn't started"]);

    // all picks made, then finished
    const full = pickAll(drafting());
    expect(onTheClock(full.expansion!)).toBeNull();
    expect(pickProblems(full, pid('A', 'SG'))).toEqual(['The expansion draft is finished']);
    const done = apply(full, finishExpansion(full, ctx));
    expect(pickProblems(done, pid('A', 'SG'))).toEqual(['The expansion draft is finished']);
    expect(problemsOf(expansionPick(done, pid('A', 'SG'), ctx)).join(' ')).toMatch(/expansion draft is held at the/);
  });

  it('refuses a pick off the calendar step', () => {
    const s = drafting();
    const cal = { ...s.calendar, steps: s.calendar.steps.map(st => ({ ...st, done: false })) };
    expect(problemsOf(expansionPick({ ...s, calendar: cal }, pid('A', 'PG'), ctx)).join(' ')).toMatch(/The expansion draft is held at the/);
  });
});

describe('finishExpansion', () => {
  it('refuses before 8 picks', () => {
    const s = pickAll(drafting(), 1);
    expect(problemsOf(finishExpansion(s, ctx))).toEqual(['7 picks are still to be made']);
    const s7 = pickAll(drafting(), 7);
    expect(problemsOf(finishExpansion(s7, ctx))).toEqual(['1 pick is still to be made']);
    expect(problemsOf(finishExpansion(drafting(), ctx))).toEqual(['8 picks are still to be made']);
  });

  it('after 8 picks writes phase done, a draftHistory expansion entry numbered 1..8 and completes the step', () => {
    const full = pickAll(drafting());
    const r = finishExpansion(full, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Finish the S80 expansion draft');
    const done = apply(full, r);

    expect(done.expansion!.phase).toBe('done');
    expect(done.calendar.steps.find(s => s.id === expansionDraftStepId(80))!.done).toBe(true);

    const entry = done.history.drafts.find(d => d.season === 80 && d.kind === 'expansion')!;
    expect(entry.picks.map(p => p.pick)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(entry.picks[0]).toEqual({
      pick: 1, teamId: 'PHI', teamName: 'Philly Phantoms', viaTeamId: null, name: 'A PG', playerId: pid('A', 'PG'),
      pos: 'PG', detail: '25', college: null,
    });
    expect(entry.picks[1]).toMatchObject({ pick: 2, teamId: 'LAL', teamName: 'Boise Raptors', name: 'B PG' });
    expect(done.history.drafts.find(d => d.season === 79)).toBeDefined();
    expect(DraftHistoryFile.safeParse(done.history).success).toBe(true);

    expect(done.tx.entries.at(-1)).toMatchObject({ type: 'expansion', lines: ['The S80 expansion draft is finished'] });
    // the final rosters: every taker holds four players
    expect(done.fba.teams.PHI.filter(e => e.playerId !== null)).toHaveLength(4);
    expect(done.fba.teams.LAL.filter(e => e.playerId !== null)).toHaveLength(4);
  });

  it('sorts the history by season, with the draft before the expansion draft', () => {
    const full = pickAll(drafting({
      history: { drafts: [{ season: 80, kind: 'draft', picks: [] }, { season: 79, kind: 'draft', picks: [] }] },
    }));
    const done = apply(full, finishExpansion(full, ctx));
    expect(done.history.drafts.map(d => `${d.season}:${d.kind}`)).toEqual(['79:draft', '80:draft', '80:expansion']);
  });

  it('refuses a second finish', () => {
    const full = pickAll(drafting());
    const done = apply(full, finishExpansion(full, ctx));
    expect(problemsOf(finishExpansion(done, ctx)).length).toBeGreaterThan(0);
    // even with the step wrongly still current, the existing history entry stops it
    const stale = { ...done, calendar: full.calendar };
    expect(problemsOf(finishExpansion(stale, ctx))).toEqual(['The expansion draft is finished']);
  });
});

describe('schemas', () => {
  it('writes only schema-valid docs', () => {
    let s = expansionState();
    const all: { path: string; doc: unknown }[] = [];
    const step = (r: WritesResult): void => {
      if (!r.ok) throw new Error(r.problems.join('; '));
      all.push(...r.writes);
      s = apply(s, r);
    };
    step(startExpansion(s, ctx));
    step(setProtections(s, 'A', [pid('A', 'SG'), pid('A', 'PF')], ctx));
    step(lockProtections(s, ctx));
    for (const [team, pos] of FULL_DRAFT) step(expansionPick(s, pid(team, pos), ctx));
    step(finishExpansion(s, ctx));

    expect(all.length).toBeGreaterThan(20);
    const expansionDocs = all.filter(w => w.path === 'leagues/fba/S80/expansion.json');
    expect(expansionDocs.length).toBe(12);
    for (const w of expansionDocs) expect(ExpansionFile.safeParse(w.doc).success).toBe(true);
    for (const w of all) {
      const schema = schemaForPath(w.path);
      expect(schema, w.path).not.toBeNull();
      const parsed = schema!.safeParse(w.doc);
      expect(parsed.success, `${w.path}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });
});
