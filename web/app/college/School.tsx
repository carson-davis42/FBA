import type { RecruitingState } from '../../engine/college/state';
import { TeamName } from '../components/TeamName';

/** A school with its logo (the abbreviation or the full name beside it); the plain id when the school isn't in the teams file. */
export function School({ state, teamId, variant = 'full', size = 18 }: { state: RecruitingState; teamId: string; variant?: 'full' | 'abbr'; size?: number }) {
  const team = state.teams.teams.find(t => t.teamId === teamId);
  return team ? <TeamName team={team} season={state.season} variant={variant} size={size} /> : <>{teamId}</>;
}
