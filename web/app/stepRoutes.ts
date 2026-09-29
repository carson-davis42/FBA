import type { CalendarStep } from '../engine/shared/types';

/** Calendar steps that have their own tool page; the tool completes the step instead of "Mark done". */
export const TOOL_STEPS: Record<string, string> = {
  'free-agency-offseason': '/league/fba/free-agency',
  'fbad2-ratings-reset': '/league/fbad2/ratings',
  'fbad2-draft': '/league/fbad2/draft',
};

/** The page that completes this step, or null when it is still a manual "Mark done" step. */
export function toolTarget(step: CalendarStep): string | null {
  if (TOOL_STEPS[step.id]) return TOOL_STEPS[step.id];
  if (/^make-s\d+-schedules$/.test(step.id)) return '/schedules';
  if (/^s\d+-fba-draft-lottery$/.test(step.id)) return '/league/fba/lottery';
  if (/^create-s\d+-class$/.test(step.id)) return '/league/fbajc/recruiting?tab=class';
  if (step.kind === 'league' && (step.league === 'fba' || step.league === 'fbad2')) return `/league/${step.league}/scores`;
  return null;
}

export function stepTarget(step: CalendarStep): string {
  const tool = toolTarget(step);
  if (tool) return tool;
  if (step.kind === 'league' && step.league) return `/league/${step.league}`;
  return '/calendar';
}
