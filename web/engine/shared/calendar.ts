import type { CalendarFile, CalendarStep, LeagueId } from './types';
import { EXPANSION_SEASON, addTeamsStepId, expansionDraftStepId } from './expansion';

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

/** A fresh calendar for season n, every step not done. Labels and flags follow the committed S79 calendar; even seasons add the World Cup, odd seasons World Cup qualifying. */
/** The step after the FBA draft where the draft class is rated, top of the prospect rankings down; whoever is left unrated goes to the D2 draft pool. */
export const rookieStepId = (season: number) => `s${season}-rate-rookies`;

export function calendarFor(n: number): CalendarFile {
  const step = (id: string, label: string, sub = false, league: LeagueId | null = null): CalendarStep => ({
    id, label, kind: league ? 'league' : 'offseason', league, sub, done: false,
  });
  return {
    season: n,
    steps: [
      step('adjust-age', 'Adjust Age', true),
      step('adjust-pro-ratings-reset', 'Adjust Pro Ratings(reset)', true),
      step(`s${n}-fba-draft`, `S${n} FBA Draft`),
      step(rookieStepId(n), `Rate S${n} Rookies`),
      ...(n === EXPANSION_SEASON ? [step(expansionDraftStepId(n), `S${n} Expansion Draft`)] : []),
      step('free-agency-offseason', 'Free Agency/Offseason'),
      step('fbad2-ratings-reset', 'FBAD2 Ratings(reset)', true),
      step('fbad2-draft', 'FBAD2 Draft', true),
      step(`create-s${n + 1}-class`, `Create S${n + 1} Class`),
      step(`make-s${n}-schedules`, `Make S${n} Schedules`),
      step('fba-d2', 'FBA D2', false, 'fbad2'),
      step('fba', 'FBA', false, 'fba'),
      ...(n + 1 === EXPANSION_SEASON ? [step(addTeamsStepId(n + 1), `Add S${n + 1} Expansion Teams`)] : []),
      step(`s${n + 1}-fba-draft-lottery`, `S${n + 1} FBA Draft Lottery`),
      step(n % 2 === 0 ? `s${n}-world-cup` : `s${n}-qualifying`, n % 2 === 0 ? `S${n} World Cup` : `S${n} Qualifying`, false, 'fbawc'),
      step('retirement', 'Retirement'),
      step('hall-of-fame-induction', 'Hall of Fame Induction'),
      step(`rank-s${n + 1}-class`, `Rank S${n + 1} Class`),
      step('adjust-college-ratings', 'Adjust College Ratings', true),
      step('fbajc', 'FBAJC', false, 'fbajc'),
    ],
  };
}

/** Adds the qualifying step (before retirement) to an odd-season calendar that lacks it; even seasons and calendars that have it are returned unchanged. */
export function withQualifyingStep(cal: CalendarFile): CalendarFile {
  const id = `s${cal.season}-qualifying`;
  if (cal.season % 2 === 0 || cal.steps.some(s => s.id === id)) return cal;
  const at = cal.steps.findIndex(s => s.id === 'retirement');
  const added: CalendarStep = { id, label: `S${cal.season} Qualifying`, kind: 'league', league: 'fbawc', sub: false, done: false };
  const steps = at < 0 ? [...cal.steps, added] : [...cal.steps.slice(0, at), added, ...cal.steps.slice(at)];
  return { ...cal, steps };
}

/** Adds the add-teams step (before the lottery) to the calendar of the season before the expansion, if it lacks it; unchanged once the lottery has run. */
export function withExpansionStep(cal: CalendarFile): CalendarFile {
  const id = addTeamsStepId(EXPANSION_SEASON);
  if (cal.season !== EXPANSION_SEASON - 1 || cal.steps.some(s => s.id === id)) return cal;
  const at = cal.steps.findIndex(s => s.id === `s${EXPANSION_SEASON}-fba-draft-lottery`);
  if (at >= 0 && cal.steps[at].done) return cal;
  const added: CalendarStep = { id, label: `Add S${EXPANSION_SEASON} Expansion Teams`, kind: 'offseason', league: null, sub: false, done: false };
  const steps = at < 0 ? [...cal.steps, added] : [...cal.steps.slice(0, at), added, ...cal.steps.slice(at)];
  return { ...cal, steps };
}

/** Adds the rookie ratings step right after the FBA draft to a calendar that lacks it; unchanged when the draft is already done or the calendar has no draft step. */
export function withRookieStep(cal: CalendarFile): CalendarFile {
  const id = rookieStepId(cal.season);
  if (cal.steps.some(s => s.id === id)) return cal;
  const at = cal.steps.findIndex(s => s.id === `s${cal.season}-fba-draft`);
  if (at < 0 || cal.steps[at].done) return cal;
  const added: CalendarStep = { id, label: `Rate S${cal.season} Rookies`, kind: 'offseason', league: null, sub: false, done: false };
  return { ...cal, steps: [...cal.steps.slice(0, at + 1), added, ...cal.steps.slice(at + 1)] };
}

const FINISHED_NAME: Record<string, string> = { fba: 'FBA', 'fba-d2': 'D2' };

/**
 * Why "Reopen previous step" is refused, or null. `finished` holds the ids of the league steps whose season is
 * finished (its summary is saved); such a step can't be reopened.
 */
export function reopenProblem(cal: CalendarFile, finished: Set<string>): string | null {
  const i = currentStepIndex(cal);
  const last = cal.steps[(i < 0 ? cal.steps.length : i) - 1];
  return last && finished.has(last.id) ? `S${cal.season} ${FINISHED_NAME[last.id] ?? last.label} season is finished` : null;
}
