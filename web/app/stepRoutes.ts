import type { CalendarStep } from '../engine/shared/types';

/** Calendar steps that have their own tool page; the tool completes the step instead of "Mark done". */
export const TOOL_STEPS: Record<string, string> = {
  'free-agency-offseason': '/league/fba/free-agency',
};

export function stepTarget(step: CalendarStep): string {
  if (step.kind === 'league' && step.league) return `/league/${step.league}`;
  return TOOL_STEPS[step.id] ?? '/calendar';
}
