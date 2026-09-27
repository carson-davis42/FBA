import { describe, expect, it } from 'vitest';
import { currentStepIndex, markCurrentDone, markStepDone, reopenLast } from './calendar';
import type { CalendarFile } from './types';

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
