import { parseBio } from '../history/career';
import { franchiseByAbbr } from '../shared/franchises';
import { collegeRegion, type Region } from '../shared/regions';
import type { FranchisesFile } from '../shared/types';

/** What a free agent's past says about which teams would want him: where he went to college and how long he has played for each FBA team. */
export interface PlayerProfile {
  /** The region of his last college (from his bio, else the school he was drafted from), or null when unknown. */
  collegeRegion: Region | null;
  /** FBA seasons with each franchise (by team id), all stints added. */
  seasonsWith: Map<string, number>;
}

export const EMPTY_PROFILE: PlayerProfile = { collegeRegion: null, seasonsWith: new Map() };

/**
 * His profile from his bio entries ("Iowa State-S76", "San Antonio Spirits-S77-pres."). `season` is the current season: a stint still open ("pres")
 * counts through the season before it. `draftCollege` is the school name when the bio has none (a rookie still on the draft board).
 */
export function playerProfile(
  bio: { born: string; entries: string[] } | null, o: { season: number; franchises: FranchisesFile | null; draftCollege?: string | null },
): PlayerProfile {
  const career = bio ? parseBio(bio) : null;
  const lastCollege = career ? [...career.stints].reverse().find(s => s.kind === 'college') : undefined;
  const school = lastCollege?.team ?? o.draftCollege ?? null;
  const seasonsWith = new Map<string, number>();
  for (const stint of career?.stints ?? []) {
    if (stint.kind !== 'fba') continue;
    const from = stint.from;
    const to = stint.to === 'pres' ? o.season - 1 : stint.to;
    if (from === null || to === null || to < from) continue;
    for (const code of stint.team.split('/')) {
      const teamId = franchiseByAbbr(o.franchises, code, from)?.teamId;
      if (teamId) seasonsWith.set(teamId, (seasonsWith.get(teamId) ?? 0) + (to - from + 1));
    }
  }
  return { collegeRegion: school ? collegeRegion(school) : null, seasonsWith };
}
