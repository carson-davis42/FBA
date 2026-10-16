import type { ClassYear, RostersFile } from '../engine/shared/types';

const NEXT_YEAR: Record<ClassYear, ClassYear | null> = { Fr: 'So', So: 'Jr', Jr: 'Sr', Sr: null };

export interface ClassYearFix { playerId: string; teamId: string; from: ClassYear | null; to: ClassYear }

/**
 * Sets every returning player's class to one above last season's: a player who was a Fr in `prev` is a So in `current`, wherever he plays now.
 * Recruits and others with no entry in `prev`, empty slots and anyone who was a Sr are left alone. Returns `current` itself when nothing changes.
 */
export function repairClassYears(prev: RostersFile, current: RostersFile): { rosters: RostersFile; changed: ClassYearFix[] } {
  const last = new Map<string, ClassYear>();
  for (const entries of Object.values(prev.teams)) for (const e of entries) if (e.playerId && e.classYear) last.set(e.playerId, e.classYear);
  const changed: ClassYearFix[] = [];
  const teams = Object.fromEntries(Object.entries(current.teams).map(([teamId, entries]) => [teamId, entries.map(e => {
    const before = e.playerId ? last.get(e.playerId) : undefined;
    const to = before ? NEXT_YEAR[before] : null;
    if (!e.playerId || !to || e.classYear === to) return e;
    changed.push({ playerId: e.playerId, teamId, from: e.classYear ?? null, to });
    return { ...e, classYear: to };
  })]));
  return changed.length ? { rosters: { ...current, teams }, changed } : { rosters: current, changed };
}
