import { resolveHistoryTeam } from '../../engine/shared/franchises';
import type { FranchisesFile, Team, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { TeamName } from '../components/TeamName';

/** The FBA teams and franchise name eras, for decoration only: a missing or unreadable doc means plain text instead of logos, never an error page. */
export function useFbaTeams() {
  const doc = useDoc<TeamsFile>('leagues/fba/teams.json');
  const fr = useDoc<FranchisesFile>('leagues/fba/franchises.json');
  const done = (d: { data?: unknown; missing: boolean; error?: unknown }) => !!d.data || d.missing || !!d.error;
  return { settled: done(doc) && done(fr), teams: doc.data?.teams ?? [], franchises: fr.data ?? null };
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

/** A team as recorded in a past season, with its franchise's logo when it resolves, else the bare text. */
export function TeamFull({ teams, franchises = null, teamId, name, season, variant = 'full', size }: {
  teams: Team[]; franchises?: FranchisesFile | null; teamId?: string | null; name: string; season: number; variant?: 'full' | 'abbr'; size?: number;
}) {
  const hit = resolveHistoryTeam(teams, franchises, name, season, teamId);
  return hit ? <TeamName team={hit.team} season={season} variant={variant} size={size} name={hit.name} abbr={hit.abbr} /> : <>{name}</>;
}
