import { appendTx, type MoveContext } from '../roster/state';
import { addTeamsStepId, EXPANSION_SEASON, EXPANSION_TEAMS } from '../shared/expansion';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, TeamsFile, TransactionsFile } from '../shared/types';
import { calendarProblem, type WritesResult } from './moves';

export interface AddTeamsState {
  /** The current season (the one before the expansion). */
  season: number;
  calendar: CalendarFile;
  teams: TeamsFile;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
}

/** The "add teams" step: the expansion teams join teams.json (with `fromSeason`), so the lottery can list them. */
export function addExpansionTeams(state: AddTeamsState, ctx: MoveContext): WritesResult {
  const id = addTeamsStepId(EXPANSION_SEASON);
  const lottery = state.calendar.steps.find(s => s.id === `s${EXPANSION_SEASON}-fba-draft-lottery`);
  if (lottery?.done || !state.calendar.steps.some(s => s.id === id)) {
    return { ok: false, problems: [`The expansion teams can't be added: the S${EXPANSION_SEASON} draft lottery has already run (or the calendar has no add-teams step)`] };
  }
  const step = calendarProblem(state.calendar, id, 'The expansion teams are added');
  if (step) return { ok: false, problems: [step] };
  const have = new Set(state.teams.teams.map(t => t.teamId));
  if (EXPANSION_TEAMS.some(t => have.has(t.teamId))) return { ok: false, problems: ['The expansion teams are already in the league'] };
  const names = EXPANSION_TEAMS.map(t => t.name).join(' and ');
  return {
    ok: true,
    label: `Add the S${EXPANSION_SEASON} expansion teams`,
    writes: [
      { path: 'leagues/fba/teams.json', doc: { ...state.teams, teams: [...state.teams.teams, ...EXPANSION_TEAMS] } },
      { path: `leagues/fba/S${state.season}/transactions.json`, doc: appendTx(state.tx, ctx, 'expansion', EXPANSION_TEAMS.map(t => t.teamId), [`${names} join the league in S${EXPANSION_SEASON}`]) },
      { path: 'calendar.json', doc: markStepDone(state.calendar, id) },
    ],
  };
}
