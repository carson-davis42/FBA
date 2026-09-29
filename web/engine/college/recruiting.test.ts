import { describe, expect, it } from 'vitest';
import { RecruitingFile, type ClassDraftRow } from '../shared/types';
import {
  addDraftRow, appendDraftRows, createClass, draftCounts, editDraftRow, editRecruit, parseClassList, removeDraftRow, removeRecruit,
} from './recruiting';
import { emptyRecruiting, recruitingWrites, type RecruitingResult, type RecruitingState } from './state';
import { collegeBaseState, collegeClassState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const drafted = (rows: ClassDraftRow[]): RecruitingState => {
  const s = collegeBaseState();
  return { ...s, recruiting: { ...s.recruiting, classDraft: rows } };
};
const withRecruit = (s: RecruitingState, id: string, patch: object): RecruitingState => ({
  ...s, recruiting: { ...s.recruiting, recruits: s.recruiting.recruits.map(p => (p.playerId === id ? { ...p, ...patch } : p)) },
});

describe('parseClassList', () => {
  it('reads "Name, POS" and "Name<Tab>POS" lines and lists the rest back', () => {
    expect(parseClassList('Zion Carter, PG\nMalik Ford\tsg\n\n  bad line \nEli Grant , PF \nSmith, Jr., C\r\n, PG')).toEqual({
      rows: [
        { name: 'Zion Carter', position: 'PG' }, { name: 'Malik Ford', position: 'SG' },
        { name: 'Eli Grant', position: 'PF' }, { name: 'Smith, Jr.', position: 'C' },
      ],
      bad: ['bad line', ', PG'],
    });
  });
});

describe('class draft edits', () => {
  it('adds, edits, appends and removes rows, and counts positions', () => {
    let doc = addDraftRow(emptyRecruiting(79), { name: '', position: 'PG' });
    doc = editDraftRow(doc, 0, { name: 'Zion Carter' });
    doc = appendDraftRows(doc, [{ name: 'Malik Ford', position: 'SG' }, { name: 'Eli Grant', position: 'SG' }]);
    doc = editDraftRow(doc, 2, { position: 'PF' });
    expect(doc.classDraft).toEqual([
      { name: 'Zion Carter', position: 'PG' }, { name: 'Malik Ford', position: 'SG' }, { name: 'Eli Grant', position: 'PF' },
    ]);
    expect(draftCounts(doc)).toEqual({ PG: 1, SG: 1, SF: 0, PF: 1, C: 0 });
    doc = removeDraftRow(doc, 1);
    expect(doc.classDraft.map(r => r.name)).toEqual(['Zion Carter', 'Eli Grant']);
    expect(RecruitingFile.safeParse(doc).success).toBe(true);
  });

  it('leaves a created or locked doc, or an unknown row, unchanged', () => {
    const created = collegeClassState().recruiting;
    expect(addDraftRow(created, { name: 'A', position: 'C' })).toBe(created);
    expect(appendDraftRows(created, [{ name: 'A', position: 'C' }])).toBe(created);
    const locked = { ...emptyRecruiting(79), locked: true, classDraft: [{ name: 'A', position: 'C' as const }] };
    expect(editDraftRow(locked, 0, { name: 'B' })).toBe(locked);
    expect(removeDraftRow(locked, 0)).toBe(locked);
    const one = addDraftRow(emptyRecruiting(79), { name: 'A', position: 'C' });
    expect(editDraftRow(one, 5, { name: 'B' })).toBe(one);
    expect(removeDraftRow(one, 5)).toBe(one);
  });
});

describe('createClass', () => {
  it('creates a player and a recruit per row, logs, and marks the calendar step done', () => {
    const r = ok(createClass(drafted([{ name: ' Zion Carter ', position: 'PG' }, { name: 'Malik Ford', position: 'SG' }]), ctx));
    expect(r.label).toBe('Create S80 class');
    expect(r.changed).toEqual(['recruiting', 'players', 'tx', 'calendar']);
    expect(r.state.players.nextId).toBe(1916);
    expect(r.state.players.players.p01914).toEqual({ id: 'p01914', name: 'Zion Carter', birthSeason: 61 });
    expect(r.state.players.players.p01915).toEqual({ id: 'p01915', name: 'Malik Ford', birthSeason: 61 });
    expect(r.state.recruiting).toMatchObject({ created: true, classDraft: [], classOf: 80 });
    expect(r.state.recruiting.recruits).toEqual([
      { playerId: 'p01914', position: 'PG', classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo: null },
      { playerId: 'p01915', position: 'SG', classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo: null },
    ]);
    expect(r.state.tx.entries.at(-1)).toMatchObject({ type: 'class', teams: [], lines: ['S80 class created: 2 recruits'] });
    expect(r.state.calendar.steps.find(s => s.id === 'create-s80-class')!.done).toBe(true);
    expect(recruitingWrites(r).map(w => w.path)).toEqual([
      'leagues/fbajc/S79/recruiting.json', 'players.json', 'leagues/fbajc/S79/transactions.json', 'calendar.json',
    ]);
    expect(RecruitingFile.safeParse(r.state.recruiting).success).toBe(true);
    const one = ok(createClass(drafted([{ name: 'Zion Carter', position: 'PG' }]), ctx));
    expect(one.state.tx.entries.at(-1)!.lines).toEqual(['S80 class created: 1 recruit']);
  });

  it('refuses an empty draft, blank names, a second creation and a locked doc', () => {
    expect(createClass(collegeBaseState(), ctx)).toEqual({ ok: false, problems: ['Add at least one recruit first'] });
    expect(createClass(drafted([{ name: 'A B', position: 'PG' }, { name: ' ', position: 'C' }]), ctx)).toEqual({ ok: false, problems: ['1 row needs a name'] });
    expect(createClass(drafted([{ name: '', position: 'PG' }, { name: ' ', position: 'C' }]), ctx)).toEqual({ ok: false, problems: ['2 rows need a name'] });
    expect(createClass(collegeClassState(), ctx)).toEqual({ ok: false, problems: ['The class has already been created'] });
    const s = drafted([{ name: 'A B', position: 'PG' }]);
    expect(createClass({ ...s, recruiting: { ...s.recruiting, locked: true } }, ctx)).toEqual({ ok: false, problems: ['Recruiting for this class is finished'] });
  });
});

describe('editRecruit and removeRecruit', () => {
  it('renames a recruit in players.json, or changes their position on the board', () => {
    const s = collegeClassState();
    const renamed = ok(editRecruit(s, 'p01914', { name: ' Zion Carver ' }));
    expect(renamed.changed).toEqual(['players']);
    expect(renamed.label).toBe('Edit Zion Carver');
    expect(renamed.state.players.players.p01914).toEqual({ id: 'p01914', name: 'Zion Carver', birthSeason: 61 });
    const moved = ok(editRecruit(s, 'p01914', { position: 'SG' }));
    expect(moved.changed).toEqual(['recruiting']);
    expect(moved.state.recruiting.recruits[0].position).toBe('SG');
  });

  it('refuses a blank name, no change, unknown players and committed recruits', () => {
    const s = collegeClassState();
    expect(editRecruit(s, 'p01914', { name: '  ' })).toEqual({ ok: false, problems: ['Enter a name'] });
    expect(editRecruit(s, 'p01914', { name: 'Zion Carter', position: 'PG' })).toEqual({ ok: false, problems: ['Nothing to change'] });
    expect(editRecruit(s, 'p00485', { name: 'Z' })).toEqual({ ok: false, problems: ["p00485 isn't in the class"] });
    expect(editRecruit(withRecruit(s, 'p01914', { committedTo: 'DUKE' }), 'p01914', { name: 'Z' }))
      .toEqual({ ok: false, problems: ['Zion Carter has committed; decommit them first'] });
  });

  it('removes an unprojected, uncommitted recruit from the class and players.json', () => {
    const r = ok(removeRecruit(collegeClassState(), 'p01915'));
    expect(r.label).toBe('Remove Malik Ford from the class');
    expect(r.changed).toEqual(['recruiting', 'players']);
    expect(r.state.recruiting.recruits.map(p => p.playerId)).toEqual(['p01914', 'p01916']);
    expect(r.state.players.players.p01915).toBeUndefined();
    expect(r.state.players.nextId).toBe(1917);
  });

  it('refuses to remove a projected or committed recruit', () => {
    const s = collegeClassState();
    expect(removeRecruit(withRecruit(s, 'p01915', { projections: { TEX: 1 } }), 'p01915'))
      .toEqual({ ok: false, problems: ["Remove Malik Ford's projections first"] });
    expect(removeRecruit(withRecruit(s, 'p01915', { committedTo: 'TEX' }), 'p01915'))
      .toEqual({ ok: false, problems: ['Malik Ford has committed; decommit them first'] });
  });
});
