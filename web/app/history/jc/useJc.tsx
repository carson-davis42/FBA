import type { JcSchoolHistoryFile, Team, TeamsFile } from '../../../engine/shared/types';
import { useDoc } from '../../api';
import { TeamName } from '../../components/TeamName';
import { findTeam } from '../useTeams';

/** The FBAJC teams, for decoration only: a missing or unreadable doc means plain text instead of logos, never an error page. */
export function useJcTeams(): { settled: boolean; teams: Team[] } {
  const doc = useDoc<TeamsFile>('leagues/fbajc/teams.json');
  return { settled: !!doc.data || doc.missing || !!doc.error, teams: doc.data?.teams ?? [] };
}

/** The imported school history (S1-S78). It is optional: a league without it still shows what the season summaries give. */
export function useJcSchoolHistory(): { settled: boolean; file: JcSchoolHistoryFile | null } {
  const doc = useDoc<JcSchoolHistoryFile>('leagues/fbajc/schoolHistory.json');
  return { settled: !!doc.data || doc.missing || !!doc.error, file: doc.data ?? null };
}

/** A college school linked to its history page when known (by id, else exact name), else the bare name. */
export function JcTeam({ teams, teamId, name, season, size }: {
  teams: Team[]; teamId?: string | null; name: string; season: number; size?: number;
}) {
  const team = findTeam(teams, teamId, name);
  return team
    ? <TeamName team={team} season={season} size={size ?? 20} to={`/history/fbajc/schools/${team.teamId}`} />
    : <>{name}</>;
}
