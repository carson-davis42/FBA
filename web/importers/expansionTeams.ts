import { EXPANSION_TEAMS } from '../engine/shared/expansion';
import type { TeamsFile } from '../engine/shared/types';

/**
 * Gives each expansion team that is already in the league its current logo folder, logo file and badge colours from `EXPANSION_TEAMS`.
 * A team still called the "Team 32" placeholder takes the definition's name and abbreviation; otherwise its name, abbreviation, conference and
 * `fromSeason` stay as they are (a team may have been named since). Teams not in the file are left alone.
 */
export function refreshExpansionTeams(teams: TeamsFile): { teams: TeamsFile; changed: string[] } {
  const changed: string[] = [];
  const out = teams.teams.map(t => {
    const def = EXPANSION_TEAMS.find(d => d.teamId === t.teamId);
    if (!def) return t;
    const { logoFile: _drop, ...rest } = t;
    const renamed = t.name === 'Team 32' && def.name !== 'Team 32' ? { name: def.name, abbr: def.abbr } : {};
    const next = { ...rest, ...renamed, logoFolder: def.logoFolder, ...(def.logoFile ? { logoFile: def.logoFile } : {}), badge: def.badge };
    if (JSON.stringify(next) === JSON.stringify(t)) return t;
    changed.push(t.teamId);
    return next;
  });
  return changed.length ? { teams: { ...teams, teams: out }, changed } : { teams, changed };
}
