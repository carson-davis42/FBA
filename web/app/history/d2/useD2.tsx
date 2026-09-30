import type { Team, TeamsFile } from '../../../engine/shared/types';
import { useDoc } from '../../api';
import { TeamName } from '../../components/TeamName';
import { findTeam } from '../useTeams';

/** The FBAD2 teams, for decoration only: a missing or unreadable doc means plain text instead of logos, never an error page. */
export function useD2Teams(): { settled: boolean; teams: Team[] } {
  const doc = useDoc<TeamsFile>('leagues/fbad2/teams.json');
  return { settled: !!doc.data || doc.missing || !!doc.error, teams: doc.data?.teams ?? [] };
}

/** A D2 team linked to its history page when known (by id, else exact name), else the bare name. */
export function D2Team({ teams, teamId, name, season, size }: {
  teams: Team[]; teamId?: string | null; name: string; season: number; size?: number;
}) {
  const team = findTeam(teams, teamId, name);
  return team
    ? <TeamName team={team} season={season} size={size ?? 20} to={`/history/fbad2/teams/${team.teamId}`} />
    : <>{name}</>;
}
