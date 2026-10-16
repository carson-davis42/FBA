import { DIVISION_LAYOUT, DIVISIONS_SEASON } from '../engine/shared/divisions';
import type { TeamsFile } from '../engine/shared/types';

/**
 * Writes the S80 division layout into an FBA teams file: every team gets its `division`, and a team whose conference changes
 * (Atlanta to the West, St. Louis to the East) keeps its old one in `formerGroup` through the season before. Idempotent.
 */
export function applyDivisions(file: TeamsFile): TeamsFile {
  const have = new Set(file.teams.map(t => t.teamId));
  const missing = DIVISION_LAYOUT.flatMap(d => d.teams).filter(id => !have.has(id));
  if (missing.length) throw new Error(`teams.json lacks ${missing.join(', ')}`);
  const teams = file.teams.map(t => {
    const def = DIVISION_LAYOUT.find(d => d.teams.includes(t.teamId));
    if (!def) return t;
    const formerGroup = t.formerGroup ?? (t.group !== def.group && t.group ? { through: DIVISIONS_SEASON - 1, group: t.group } : undefined);
    return { ...t, group: def.group, division: def.division, ...(formerGroup ? { formerGroup } : {}) };
  });
  return { ...file, teams };
}
