import type { TeamsFile } from './types';

/** Sheet spellings of D2 team names (or cities) that differ from the app's. */
export const SHEET_TEAM_ALIASES: Record<string, string> = {
  Luxemboug: 'Luxembourg', 'Sao Paolo': 'São Paulo', 'Sao Paulo': 'São Paulo', Kiev: 'Kyiv', 'Rio De Janeiro': 'Rio de Janeiro',
};

/**
 * Name (or sheet alias) → team id, then city → team id. The sheets name a club by its city ("Munich"), and clubs have been renamed after their logos
 * ("Münchner BC"), so a name that isn't a team name falls back to the city of the one club that has it; a city shared by two clubs matches neither.
 */
export function d2TeamIds(teams: Pick<TeamsFile, 'teams'>): (name: string) => string | undefined {
  const byName = new Map(teams.teams.map(t => [t.name, t.teamId]));
  const byCity = new Map<string, string | null>();
  for (const t of teams.teams) {
    if (!t.city) continue;
    byCity.set(t.city, byCity.has(t.city) ? null : t.teamId);
  }
  return name => byName.get(SHEET_TEAM_ALIASES[name] ?? name) ?? byCity.get(SHEET_TEAM_ALIASES[name] ?? name) ?? undefined;
}
