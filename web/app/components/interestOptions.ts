import type { InterestOptions } from '../../engine/roster/interest';
import { playerProfile } from '../../engine/roster/interestProfile';
import { cityRegion, type Region } from '../../engine/shared/regions';
import type { DraftFile, FranchisesFile, PlayerBiosFile, TeamsFile } from '../../engine/shared/types';

/** What the interest ranking reads besides the rosters; any of it may still be loading or missing. */
export interface InterestContext {
  franchises: FranchisesFile | null; bios: PlayerBiosFile | null; draft: DraftFile | null; jcTeams: TeamsFile | null;
}

/** The ranking options for one player: each team's region from its city, and his college region and seasons with each team from his bio. */
export function interestOptions(context: InterestContext, playerId: string, season: number): InterestOptions {
  const { franchises, bios, draft, jcTeams } = context;
  const teamRegions = new Map<string, Region>();
  for (const f of franchises?.franchises ?? []) {
    const region = cityRegion(f.eras[f.eras.length - 1]?.city ?? '');
    if (region) teamRegions.set(f.teamId, region);
  }
  const bio = bios?.bios.find(b => b.playerId === playerId) ?? null;
  const prospect = draft?.prospects.find(p => p.playerId === playerId);
  const draftCollege = prospect ? jcTeams?.teams.find(t => t.teamId === prospect.college)?.name ?? null : null;
  return { teamRegions, profile: playerProfile(bio, { season, franchises, draftCollege }) };
}
