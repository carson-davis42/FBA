import type { CalendarFile } from './types';

export function currentStepIndex(cal: CalendarFile): number {
  return cal.steps.findIndex(s => !s.done);
}

export function markCurrentDone(cal: CalendarFile): CalendarFile {
  const i = currentStepIndex(cal);
  if (i < 0) return cal;
  return { ...cal, steps: cal.steps.map((s, j) => (j === i ? { ...s, done: true } : s)) };
}

export function reopenLast(cal: CalendarFile): CalendarFile {
  const i = currentStepIndex(cal);
  const last = (i < 0 ? cal.steps.length : i) - 1;
  if (last < 0) return cal;
  return { ...cal, steps: cal.steps.map((s, j) => (j === last ? { ...s, done: false } : s)) };
}

/** Marks the step with this id done (whether or not it is the current one). Unknown ids leave the calendar unchanged. */
export function markStepDone(cal: CalendarFile, id: string): CalendarFile {
  if (!cal.steps.some(s => s.id === id)) return cal;
  return { ...cal, steps: cal.steps.map(s => (s.id === id ? { ...s, done: true } : s)) };
}
