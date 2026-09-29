import { seasonDocPath, type SeasonState } from '../../engine/season/state';
import { META } from '../d2/testDocs';

/** Every doc the season pages load for this state (missing optional docs are left out → 404). */
export function seasonDocs(state: SeasonState): Record<string, unknown> {
  const { league, season } = state;
  const out: Record<string, unknown> = {
    'meta.json': META,
    'players.json': state.players,
    'calendar.json': state.calendar,
    [`leagues/${league}/teams.json`]: state.teams,
    [seasonDocPath('rosters', league, season)]: state.rosters,
    [seasonDocPath('tx', league, season)]: state.tx,
  };
  if (state.schedule) out[seasonDocPath('schedule', league, season)] = state.schedule;
  if (state.results) out[seasonDocPath('results', league, season)] = state.results;
  if (state.playoffs) out[seasonDocPath('playoffs', league, season)] = state.playoffs;
  if (state.awards) out[seasonDocPath('awards', league, season)] = state.awards;
  if (state.summary) out[seasonDocPath('summary', league, season)] = state.summary;
  if (state.allstar) out[seasonDocPath('allstar', 'fba', season)] = state.allstar;
  if (state.ratingPause) out[seasonDocPath('ratingPause', 'fba', season, state.ratingPause.afterGame)] = state.ratingPause;
  return out;
}
