import { DIVISIONS_SEASON } from './divisions';
import type { Team, TeamsFile } from './types';

/** The team's conference in `season` (a team that changed conference keeps its old one through `formerGroup.through`). */
export function groupInSeason(team: Team, season: number): string | null {
  return team.formerGroup && season <= team.formerGroup.through ? team.formerGroup.group : team.group;
}

/** The teams that play in `season`: a team with `fromSeason` joins that season; conference and division are those of the season. */
export function teamsInSeason(file: TeamsFile, season: number): TeamsFile {
  const teams = file.teams
    .filter(t => t.fromSeason === undefined || t.fromSeason <= season)
    .map(t => {
      if (!t.formerGroup && (t.division === undefined || season >= DIVISIONS_SEASON)) return t;
      const { division, ...rest } = t;
      return { ...rest, group: groupInSeason(t, season), ...(season >= DIVISIONS_SEASON && division !== undefined ? { division } : {}) };
    });
  return { ...file, teams };
}

/** The teams whose first season is exactly `season` (the expansion teams of that year). */
export function teamsJoining(file: TeamsFile, season: number): Team[] {
  return file.teams.filter(t => t.fromSeason === season);
}
