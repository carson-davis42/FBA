import type { Team, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { TeamName } from '../components/TeamName';

/** The FBA teams, for decoration only: a missing or unreadable doc means plain text instead of logos, never an error page. */
export function useFbaTeams() {
  const doc = useDoc<TeamsFile>('leagues/fba/teams.json');
  const settled = !!doc.data || doc.missing || !!doc.error;
  return { settled, teams: doc.data?.teams ?? [] };
}

/** A team by id, else by exact name. */
export function findTeam(teams: Team[], id?: string | null, name?: string | null): Team | undefined {
  return (id ? teams.find(t => t.teamId === id) : undefined) ?? (name ? teams.find(t => t.name === name) : undefined);
}

/** A team's abbreviation with its logo when the team is known, else the bare text. */
export function TeamAbbr({ teams, teamId, season }: { teams: Team[]; teamId: string; season: number }) {
  const team = findTeam(teams, teamId);
  return team ? <TeamName team={team} season={season} variant="abbr" size={16} /> : <>{teamId}</>;
}

/** A team's full name with its logo when the team is known, else the bare text. */
export function TeamFull({ teams, teamId, name, season }: { teams: Team[]; teamId?: string | null; name: string; season: number }) {
  const team = findTeam(teams, teamId, name);
  return team ? <TeamName team={team} season={season} /> : <>{name}</>;
}
