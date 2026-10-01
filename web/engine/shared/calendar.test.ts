import { describe, expect, it } from 'vitest';
import { calendarFor, currentStepIndex, markCurrentDone, markStepDone, reopenLast, reopenProblem, withQualifyingStep } from './calendar';
import { CalendarFile } from './types';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const cal = (done: boolean[]): CalendarFile => ({
  season: 79,
  steps: done.map((d, i) => ({ id: `s${i}`, label: `Step ${i}`, kind: 'offseason', league: null, sub: false, done: d })),
});

describe('calendar helpers', () => {
  it('finds the first unfinished step', () => {
    expect(currentStepIndex(cal([true, false, false]))).toBe(1);
  });
  it('returns -1 when everything is done', () => {
    expect(currentStepIndex(cal([true, true]))).toBe(-1);
  });
  it('marks only the current step done', () => {
    expect(markCurrentDone(cal([true, false, false])).steps.map(s => s.done)).toEqual([true, true, false]);
  });
  it('reopens the most recently finished step', () => {
    expect(reopenLast(cal([true, true, false])).steps.map(s => s.done)).toEqual([true, false, false]);
  });
  it('does not mutate its input', () => {
    const c = cal([false]);
    markCurrentDone(c);
    expect(c.steps[0].done).toBe(false);
  });
  it('marks a step done by id and leaves the others alone', () => {
    const cal = { season: 79, steps: [
      { id: 'a', label: 'A', kind: 'offseason' as const, league: null, sub: false, done: false },
      { id: 'b', label: 'B', kind: 'offseason' as const, league: null, sub: false, done: false },
    ] };
    const next = markStepDone(cal, 'b');
    expect(next.steps.map(s => s.done)).toEqual([false, true]);
    expect(cal.steps[1].done).toBe(false);
    expect(markStepDone(cal, 'zzz')).toEqual(cal);
  });
});

describe('calendarFor', () => {
  it('matches the committed calendar for its season (golden)', () => {
    const committed = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'data', 'calendar.json'), 'utf8')) as CalendarFile;
    // The committed S79 calendar predates the qualifying step (the user will migrate it), so compare after adding the step.
    expect(calendarFor(committed.season)).toEqual(withQualifyingStep({ ...committed, steps: committed.steps.map(s => ({ ...s, done: false })) }));
    expect(committed.season).toBeGreaterThanOrEqual(79);
  });

  it('adds the World Cup after the draft lottery in even seasons only', () => {
    const s80 = calendarFor(80);
    const ids = s80.steps.map(s => s.id);
    expect(ids.slice(ids.indexOf('s81-fba-draft-lottery'), ids.indexOf('retirement') + 1)).toEqual(['s81-fba-draft-lottery', 's80-world-cup', 'retirement']);
    expect(s80.steps.find(s => s.id === 's80-world-cup')).toEqual({ id: 's80-world-cup', label: 'S80 World Cup', kind: 'league', league: 'fbawc', sub: false, done: false });
    expect(s80.season).toBe(80);
    expect(s80.steps[0]).toEqual({ id: 'adjust-age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: false });
    expect(ids).toContain('make-s80-schedules');
    expect(CalendarFile.safeParse(s80).success).toBe(true);
    expect(calendarFor(81).steps.some(s => s.id.includes('world-cup'))).toBe(false);
  });
});

describe('qualifying step', () => {
  const qStep = { id: 's81-qualifying', label: 'S81 Qualifying', kind: 'league', league: 'fbawc', sub: false, done: false };

  it('odd seasons get the qualifying step where even seasons have the World Cup', () => {
    const s81 = calendarFor(81);
    const ids = s81.steps.map(s => s.id);
    expect(ids.slice(ids.indexOf('s82-fba-draft-lottery'), ids.indexOf('retirement') + 1)).toEqual(['s82-fba-draft-lottery', 's81-qualifying', 'retirement']);
    expect(s81.steps.find(s => s.id === 's81-qualifying')).toEqual(qStep);
    expect(CalendarFile.safeParse(s81).success).toBe(true);
  });

  it('even seasons have no qualifying step', () => {
    expect(calendarFor(80).steps.some(s => s.id.includes('qualifying'))).toBe(false);
  });

  it('withQualifyingStep inserts once, before retirement, keeping done flags', () => {
    const base = calendarFor(79);
    const old = { ...base, steps: base.steps.filter(s => !s.id.includes('qualifying')).map((s, i) => ({ ...s, done: i < 3 })) };
    const once = withQualifyingStep(old);
    const ids = once.steps.map(s => s.id);
    expect(ids.indexOf('s79-qualifying')).toBe(ids.indexOf('retirement') - 1);
    expect(once.steps.find(s => s.id === 's79-qualifying')?.done).toBe(false);
    expect(once.steps.filter(s => s.id !== 's79-qualifying').map(s => s.done)).toEqual(old.steps.map(s => s.done));
    expect(withQualifyingStep(once)).toEqual(once);
    expect(once.steps).toHaveLength(old.steps.length + 1);
  });

  it('withQualifyingStep leaves even seasons alone', () => {
    const c = calendarFor(80);
    expect(withQualifyingStep(c)).toBe(c);
  });
});

describe('reopenProblem', () => {
  const at = (done: boolean[]): CalendarFile => ({ season: 79, steps: [
    { id: 'fba-d2', label: 'FBA D2', kind: 'league', league: 'fbad2', sub: false, done: done[0] },
    { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: done[1] },
    { id: 'retirement', label: 'Retirement', kind: 'offseason', league: null, sub: false, done: done[2] },
  ] });

  it('refuses to reopen a league step whose season is finished', () => {
    expect(reopenProblem(at([true, false, false]), new Set(['fba-d2']))).toBe('S79 D2 season is finished');
    expect(reopenProblem(at([true, true, false]), new Set(['fba-d2', 'fba']))).toBe('S79 FBA season is finished');
  });

  it('allows other steps and unfinished league steps, and is null when nothing can be reopened', () => {
    expect(reopenProblem(at([true, true, true]), new Set(['fba-d2', 'fba']))).toBeNull();
    expect(reopenProblem(at([true, false, false]), new Set())).toBeNull();
    expect(reopenProblem(at([false, false, false]), new Set(['fba-d2']))).toBeNull();
  });
});
