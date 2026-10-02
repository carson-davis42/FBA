import type { Team, TeamsFile } from '../../../engine/shared/types';
import { useDoc } from '../../api';
import { TeamName } from '../../components/TeamName';
import { findTeam } from '../useTeams';

/** The World Cup teams, for decoration only: a missing or unreadable doc means plain text instead of flags, never an error page. */
export function useWcTeams(): { settled: boolean; teams: Team[] } {
  const doc = useDoc<TeamsFile>('leagues/fbawc/teams.json');
  return { settled: !!doc.data || doc.missing || !!doc.error, teams: doc.data?.teams ?? [] };
}

/** A World Cup country with its flag when known (by id, else exact name), else the bare name. Linked to the country's history page. */
export function WcTeam({ teams, teamId, name, season, size }: {
  teams: Team[]; teamId?: string | null; name: string; season: number; size?: number;
}) {
  const team = findTeam(teams, teamId, name);
  return team ? <TeamName team={team} season={season} size={size ?? 20} to={`/history/fbawc/teams/${team.teamId}`} /> : <>{name}</>;
}
