import type { Team, TeamsFile } from './types';

/** The teams that play in `season`: a team with `fromSeason` joins that season. */
export function teamsInSeason(file: TeamsFile, season: number): TeamsFile {
  return { ...file, teams: file.teams.filter(t => t.fromSeason === undefined || t.fromSeason <= season) };
}

/** The teams whose first season is exactly `season` (the expansion teams of that year). */
export function teamsJoining(file: TeamsFile, season: number): Team[] {
  return file.teams.filter(t => t.fromSeason === season);
}
