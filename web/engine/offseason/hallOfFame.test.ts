import { describe, expect, it } from 'vitest';
import { calendarFor } from '../shared/calendar';
import type { CalendarFile, HallOfFameFile, HofCard, PlayersFile, SummaryFile, TransactionsFile } from '../shared/types';
import {
  addNominees, candidates, CLASS_SIZE, editNominee, freeNameCard, HOF_PATH, HOF_STEP, induct, NOMINEE_CAP, prefillCard, removeNominee,
  type HofState,
} from './hallOfFame';

const ctx = { batchId: 'b1' };
const writeMap = (r: { ok: true; writes: { path: string; doc: unknown }[] }) => Object.fromEntries(r.writes.map(w => [w.path, w.doc]));

const pid = (n: number) => `p${String(n).padStart(5, '0')}`;
const retired = (season: number, league: 'fba' | 'fbad2' = 'fba', teamId: string | null = 'DCB') => ({ season, league, teamId, position: 'PG' as const });
const players = (): PlayersFile => ({
  nextId: 20,
  players: {
    [pid(1)]: { id: pid(1), name: 'Zed Zephyr', birthSeason: 46, retired: retired(79) },
    [pid(2)]: { id: pid(2), name: 'Al Able', birthSeason: 46, retired: retired(79, 'fbad2', 'AMS') },
    [pid(3)]: { id: pid(3), name: 'Bo Baker', birthSeason: 46, retired: retired(78, 'fbad2', null) },
    [pid(4)]: { id: pid(4), name: 'Cy Cole', birthSeason: 46, retired: retired(79) },
    [pid(5)]: { id: pid(5), name: 'Di Dunn', birthSeason: 46, retired: retired(70) },
    [pid(6)]: { id: pid(6), name: 'Ed Eyre', birthSeason: 46, retired: retired(70) },
    [pid(7)]: { id: pid(7), name: 'Fay Fox', birthSeason: 46 },
    [pid(8)]: { id: pid(8), name: null, birthSeason: 46, retired: retired(79) },
  },
});
const card = (name: string, playerId: string | null = null, lines: string[] = []): HofCard => ({ name, playerId, retiredSeason: 'S79', lines });
const hof = (over: Partial<HallOfFameFile> = {}): HallOfFameFile => ({ league: 'fba', classes: [], nominees: [], removed: [], ...over });
const calendarAtHof = (): CalendarFile => {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === HOF_STEP);
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
};
const emptyTx = (): TransactionsFile => ({ league: 'fba', season: 79, entries: [] });
const state = (over: Partial<HofState> = {}): HofState => ({
  season: 79, calendar: calendarAtHof(), hof: hof({ nominees: [card('A'), card('B'), card('C'), card('D')] }), players: players(), tx: emptyTx(), summaries: [], ...over,
});
const summary = (season: number, over: Partial<SummaryFile> = {}): SummaryFile => ({
  league: 'fba', season, locked: true, host: null, champions: [], ...over,
});
const slot = (playerId: string | null) => ({ slot: 'ANY' as const, playerId, teamId: 'DCB' });
const fiveOf = (first: string | null) => [slot(first), slot(null), slot(null), slot(null), slot(null)];

describe('constants', () => {
  it('has the fixed values', () => {
    expect(NOMINEE_CAP).toBe(15);
    expect(CLASS_SIZE).toBe(3);
    expect(HOF_PATH).toBe('leagues/fba/hallOfFame.json');
    expect(HOF_STEP).toBe('hall-of-fame-induction');
  });
});

describe('candidates', () => {
  it('lists named retirees not already nominated, inducted or removed, newest first then by name', () => {
    const h = hof({
      nominees: [card('Cy Cole', pid(4))],
      classes: [{ season: 'S70', inductees: [card('Di Dunn', pid(5))] }],
      removed: [{ name: 'Ed Eyre', playerId: pid(6) }],
    });
    expect(candidates(h, players()).map(c => c.playerId)).toEqual([pid(2), pid(1), pid(3)]);
  });
  it('carries the name and retired info, and skips unnamed and unretired players', () => {
    const list = candidates(hof(), players());
    expect(list.find(c => c.playerId === pid(3))).toEqual({ playerId: pid(3), name: 'Bo Baker', retired: retired(78, 'fbad2', null) });
    expect(list.some(c => c.playerId === pid(7) || c.playerId === pid(8))).toBe(false);
  });
});

describe('prefillCard', () => {
  const c = (id: number) => candidates(hof(), players()).find(x => x.playerId === pid(id))!;
  it('starts with the FBA team line and the retirement season', () => {
    expect(prefillCard(c(1), [])).toEqual({ name: 'Zed Zephyr', playerId: pid(1), retiredSeason: 'S79', lines: ['DCB: …-S79'] });
  });
  it('uses D2 <team> and D2 Reserves for D2 retirees', () => {
    expect(prefillCard(c(2), []).lines[0]).toBe('D2 AMS: …-S79');
    const b = prefillCard(c(3), []);
    expect(b.retiredSeason).toBe('S78');
    expect(b.lines[0]).toBe('D2 Reserves: …-S78');
  });
  it('adds award and All-FBA lines, oldest summary first', () => {
    const s78 = summary(78, { awards: [{ award: 'MVP', playerId: pid(1), teamId: 'DCB' }, { award: 'ROTY', playerId: pid(4), teamId: 'DCB' }] });
    const s79 = summary(79, {
      awards: [{ award: 'DPOY', playerId: pid(1), teamId: 'DCB' }],
      allFba: { team1: fiveOf(pid(1)), team2: fiveOf(pid(4)) },
    });
    const lines = prefillCard(c(1), [s79, s78]).lines;
    expect(lines).toEqual(['DCB: …-S79', 'S78 MVP', 'S79 DPOY', 'S79 All-FBA T1']);
    expect(prefillCard(c(4), [s78, s79]).lines).toEqual(['DCB: …-S79', 'S78 ROTY', 'S79 All-FBA T2']);
  });
  it('tolerates summaries with no awards or All-FBA teams', () => {
    expect(prefillCard(c(1), [summary(78), summary(79, { allFba: null })]).lines).toEqual(['DCB: …-S79']);
  });
});

describe('freeNameCard', () => {
  it('has no player id and no lines', () => {
    expect(freeNameCard('Old Timer', 'S--')).toEqual({ name: 'Old Timer', playerId: null, retiredSeason: 'S--', lines: [] });
  });
});

describe('addNominees', () => {
  it('adds cards, writing only the Hall of Fame doc', () => {
    const r = addNominees(hof({ nominees: [card('A')] }), [card('B'), card('C')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Add Hall of Fame nominees');
    expect(r.writes.map(w => w.path)).toEqual([HOF_PATH]);
    expect((r.writes[0].doc as HallOfFameFile).nominees.map(n => n.name)).toEqual(['A', 'B', 'C']);
  });
  it('refuses past the cap of 15, but allows exactly 15', () => {
    const full = hof({ nominees: Array.from({ length: 14 }, (_, i) => card(`N${i}`)) });
    expect(addNominees(full, [card('X')]).ok).toBe(true);
    expect(addNominees(full, [card('X'), card('Y')])).toEqual({ ok: false, problems: ['The nominee list is capped at 15: remove someone first'] });
  });
  it('refuses a duplicate of a nominee, an inductee or a removed player', () => {
    const h = hof({
      nominees: [card('Cy Cole', pid(4))],
      classes: [{ season: 'S70', inductees: [card('Di Dunn', pid(5))] }],
      removed: [{ name: 'Ed Eyre', playerId: pid(6) }],
    });
    for (const dup of [card('Cy Cole', pid(4)), card('Di Dunn', pid(5)), card('Ed Eyre', pid(6))]) {
      expect(addNominees(h, [dup])).toEqual({ ok: false, problems: [`${dup.name} is already on the list, in the Hall, or was removed`] });
    }
  });
  it('matches a free-name card by name, ignoring case, and duplicates within the batch', () => {
    const h = hof({ nominees: [card('Old Timer')], removed: [{ name: 'Gone Guy', playerId: null }] });
    expect(addNominees(h, [card('old timer')])).toEqual({ ok: false, problems: ['old timer is already on the list, in the Hall, or was removed'] });
    expect(addNominees(h, [card('GONE GUY')]).ok).toBe(false);
    expect(addNominees(hof(), [card('Twin'), card('twin')]).ok).toBe(false);
  });
});

describe('editNominee', () => {
  const h = () => hof({ nominees: [card('A', null, ['x']), card('B')] });
  it('replaces the fields, dropping blank lines', () => {
    const r = editNominee(h(), 0, { name: ' Alpha ', retiredSeason: 'S80', lines: ['one', '  ', '', 'two'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Edit Hall of Fame nominee');
    expect(r.writes.map(w => w.path)).toEqual([HOF_PATH]);
    const out = (r.writes[0].doc as HallOfFameFile).nominees;
    expect(out[0]).toEqual({ name: 'Alpha', playerId: null, retiredSeason: 'S80', lines: ['one', 'two'] });
    expect(out[1].name).toBe('B');
  });
  it('refuses a blank name and a bad index', () => {
    expect(editNominee(h(), 0, { name: '  ' }).ok).toBe(false);
    expect(editNominee(h(), 5, { name: 'Z' }).ok).toBe(false);
  });
});

describe('removeNominee', () => {
  it('moves the nominee to removed', () => {
    const r = removeNominee(hof({ nominees: [card('A', pid(1)), card('B')], removed: [{ name: 'Old', playerId: null }] }), 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('Remove Hall of Fame nominee');
    const doc = r.writes[0].doc as HallOfFameFile;
    expect(r.writes[0].path).toBe(HOF_PATH);
    expect(doc.nominees.map(n => n.name)).toEqual(['B']);
    expect(doc.removed).toEqual([{ name: 'Old', playerId: null }, { name: 'A', playerId: pid(1) }]);
  });
  it('refuses a bad index', () => {
    expect(removeNominee(hof(), 0).ok).toBe(false);
  });
});

describe('induct', () => {
  it('refuses off the step', () => {
    const r = induct(state({ calendar: calendarFor(79) }), [0, 1, 2], ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toContain('Hall of Fame Induction step');
  });
  it('refuses when there are no nominees', () => {
    expect(induct(state({ hof: hof() }), [], ctx)).toEqual({ ok: false, problems: ['There are no nominees'] });
  });
  it('needs exactly three distinct valid indexes', () => {
    for (const bad of [[0, 1], [0, 1, 2, 3], [0, 1, 1], [0, 1, 9], [0, 1, -1], [0, 1, 1.5]]) {
      expect(induct(state(), bad, ctx)).toEqual({ ok: false, problems: ['Pick exactly 3 nominees'] });
    }
  });
  it('needs every nominee when fewer than three remain', () => {
    const s = state({ hof: hof({ nominees: [card('A'), card('B')] }) });
    expect(induct(s, [0], ctx)).toEqual({ ok: false, problems: ['Pick exactly 2 nominees'] });
    const r = induct(s, [1, 0], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((writeMap(r)[HOF_PATH] as HallOfFameFile).nominees).toEqual([]);
  });
  it('refuses when the class already exists', () => {
    const s = state({ hof: hof({ classes: [{ season: 'S79', inductees: [] }], nominees: [card('A'), card('B'), card('C')] }) });
    const r = induct(s, [0, 1, 2], ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toContain('S79');
  });
  it('appends the class, removes the inductees, logs one transaction and marks the step done', () => {
    const r = induct(state(), [3, 0, 2], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.label).toBe('S79 Hall of Fame class');
    const w = writeMap(r);
    expect(Object.keys(w).sort()).toEqual(['calendar.json', HOF_PATH, 'leagues/fba/S79/transactions.json'].sort());
    const doc = w[HOF_PATH] as HallOfFameFile;
    expect(doc.classes).toEqual([{ season: 'S79', inductees: [card('A'), card('C'), card('D')] }]);
    expect(doc.nominees.map(n => n.name)).toEqual(['B']);
    const tx = w['leagues/fba/S79/transactions.json'] as TransactionsFile;
    expect(tx.entries).toEqual([{ seq: 1, batchId: 'b1', type: 'hall-of-fame', teams: [], lines: ['S79 Hall of Fame class: A, C, D'] }]);
    const cal = w['calendar.json'] as CalendarFile;
    expect(cal.steps.find(s => s.id === HOF_STEP)!.done).toBe(true);
  });
});
