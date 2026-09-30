import type { FranchiseEra, FranchisesFile, Team } from './types';

/** Names in the history sources that are typos of a franchise name. */
const ALIASES: Record<string, string> = { 'Denver Height': 'Denver Heights' };

/**
 * The franchise that used `name` in `season`: the era covering the season (the later-starting one when two do),
 * else the nearest era with that name. Null without a file or for an unknown name.
 */
export function franchiseAt(file: FranchisesFile | null | undefined, name: string, season: number): { teamId: string; era: FranchiseEra } | null {
  if (!file) return null;
  const want = ALIASES[name.trim()] ?? name.trim();
  const hits = file.franchises.flatMap(f => f.eras.filter(e => e.name === want).map(era => ({ teamId: f.teamId, era })));
  if (!hits.length) return null;
  const covers = (e: FranchiseEra) => e.from <= season && (e.to === null || season <= e.to);
  const covering = hits.filter(h => covers(h.era)).sort((a, b) => b.era.from - a.era.from);
  if (covering.length) return covering[0];
  const distance = (e: FranchiseEra) => (season < e.from ? e.from - season : season - (e.to ?? season));
  return [...hits].sort((a, b) => distance(a.era) - distance(b.era) || b.era.from - a.era.from)[0];
}

/** A current team as it appeared in a past season: the name and abbreviation it used then. */
export interface HistoryTeam { team: Team; name: string; abbr: string }

/**
 * The team behind a name recorded in `season`. A stored `teamId` wins; then the franchise lookup; then an exact
 * match on a current name. The era's name and abbreviation are used when the era belongs to that team.
 */
export function resolveHistoryTeam(
  teams: Team[], file: FranchisesFile | null | undefined, name: string, season: number, teamId?: string | null,
): HistoryTeam | null {
  const hit = franchiseAt(file, name, season);
  const team = (teamId ? teams.find(t => t.teamId === teamId) : undefined)
    ?? (hit ? teams.find(t => t.teamId === hit.teamId) : undefined)
    ?? teams.find(t => t.name === name);
  if (!team) return null;
  const era = hit && hit.teamId === team.teamId ? hit.era : null;
  return { team, name: era?.name ?? name, abbr: era?.abbr ?? team.abbr };
}
