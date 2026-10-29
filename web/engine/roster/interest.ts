import { areNeighbours, type Region } from '../shared/regions';
import { marketRows } from './market';
import { CAP, isExpired, openSpots, payroll } from './rules';
import { nameOf, type RosterState } from './state';
import { marketAmount, teamRanks } from './tradeValue';
import { EMPTY_PROFILE, type PlayerProfile } from './interestProfile';

/** How much better a free agent must be than the player a team holds at his position for it to be interested anyway. */
export const UPGRADE_MARGIN = 5;

/** The points each part of the score is worth at most (100 in all, and the 10 for his own team on top). */
export const WEIGHTS = {
  strength: 40,
  filled: 20,
  region: 15,
  history: 15,
  ownTeam: 10,
} as const;
/** The most players a team is credited for: he would take a spot, so at most four others count. */
export const MAX_FILLED = 4;
/** Seasons with a team that earn the full history points. */
export const FULL_HISTORY_SEASONS = 5;
/** A college in a region next to the team's earns this share of the region points. */
export const NEIGHBOUR_SHARE = 1 / 3;

export interface InterestScore {
  strength: number;
  filled: number;
  region: number;
  history: number;
  ownTeam: number;
  total: number;
}

export interface InterestedTeam {
  teamId: string;
  /** Where the team stands among all FBA teams by average rating: 1 is the strongest. */
  strength: number;
  /** The points behind the ranking. */
  score: InterestScore;
  /** FBA seasons he has played for this team. */
  seasonsWith: number;
  /** `resign`: his own team, whose contract with him has ended. `need`: nobody holds his position. `upgrade`: he is clearly better than the holder. */
  reason: 'resign' | 'need' | 'upgrade';
  holder: { playerId: string; name: string; rating: number | null } | null;
  /** Cap room: the cap less the contracts that still run (zero or less: the team would have to clear space first). */
  room: number;
  /** What a typical contract for his rating costs; null while he has no FBA rating (a D2 player). */
  ask: number | null;
  /** The $1 each of his team's other open spots still needs once he is signed. */
  reserve: number;
  /** The room covers the typical ask (or the $1 minimum when there is no ask yet) plus the reserve. */
  affordable: boolean;
}

const ORDER = { resign: 0, need: 1, upgrade: 2 } as const;

export interface InterestOptions {
  /** His college region and seasons with each team; without it only strength, filled spots and his own team count. */
  profile?: PlayerProfile;
  /** The region of each FBA team (by team id). */
  teamRegions?: Map<string, Region>;
}

/**
 * The teams that would be interested in a player on the market: the team he is leaving, teams with nobody at his position, and teams that
 * hold someone clearly worse. A team with a need is listed even without cap room (it would have to clear space first, and `affordable` says so);
 * an upgrade is only listed when the typical ask fits.
 *
 * They are ranked by a score out of 100 (plus 10 for his own team): team strength (the strongest team gets 40), filled spots (5 each for up to
 * four players under contract, so a team with one 88 doesn't lead), his college's region (the full 15 for the same region, a third for a
 * neighbouring one), and his seasons with the team (15 at five or more). Ties go to affordability, then why they're interested, then cap room.
 */
export function interestedTeams(state: RosterState, playerId: string, options: InterestOptions = {}): InterestedTeam[] {
  const row = marketRows(state).find(r => r.playerId === playerId);
  if (!row) return [];
  const profile = options.profile ?? EMPTY_PROFILE;
  const ask = row.scale === 'FBA' && row.rating !== null ? Math.max(1, Math.round(marketAmount(row.rating))) : null;
  const ranks = teamRanks(state.fba);
  const size = ranks.size;
  const strengthOf = (teamId: string) => size - (ranks.get(teamId) ?? 1) + 1;
  const scored = (teamId: string, entries: typeof state.fba.teams[string], own: boolean): { score: InterestScore; seasonsWith: number } => {
    const strength = size > 1 ? WEIGHTS.strength * (size - strengthOf(teamId)) / (size - 1) : WEIGHTS.strength;
    const under = entries.filter(e => e.playerId !== null && e.playerId !== playerId && !(isExpired(e, state.season) && !e.restricted)).length;
    const filled = (WEIGHTS.filled / MAX_FILLED) * Math.min(MAX_FILLED, under);
    const teamRegion = options.teamRegions?.get(teamId);
    const region = !profile.collegeRegion || !teamRegion ? 0
      : teamRegion === profile.collegeRegion ? WEIGHTS.region
        : areNeighbours(teamRegion, profile.collegeRegion) ? WEIGHTS.region * NEIGHBOUR_SHARE : 0;
    // The bio is only brought up to date when the season rolls over, so a player traded here this offseason has no stint with his current team yet: he is on it now, which is at least one season.
    const seasonsWith = Math.max(profile.seasonsWith.get(teamId) ?? 0, own ? 1 : 0);
    const history = WEIGHTS.history * Math.min(seasonsWith, FULL_HISTORY_SEASONS) / FULL_HISTORY_SEASONS;
    const ownTeam = own ? WEIGHTS.ownTeam : 0;
    const round = (n: number) => Math.round(n * 10) / 10;
    const parts = { strength: round(strength), filled: round(filled), region: round(region), history: round(history), ownTeam };
    return { score: { ...parts, total: round(parts.strength + parts.filled + parts.region + parts.history + parts.ownTeam) }, seasonsWith };
  };
  const out: InterestedTeam[] = [];
  for (const [teamId, entries] of Object.entries(state.fba.teams)) {
    const room = CAP - payroll(entries, state.season);
    const open = openSpots(entries, state.season);
    const own = row.from === teamId && row.type === 'Expired';
    // His own spot is already open for his own team (his contract ended) and for a team with nobody at his position; replacing a holder opens none.
    const reserveFor = (fillsOpen: boolean) => Math.max(0, open - (fillsOpen ? 1 : 0));
    const affordableWith = (reserve: number) => room >= (ask ?? 1) + reserve;
    if (own) {
      const reserve = reserveFor(true);
      out.push({ teamId, strength: strengthOf(teamId), ...scored(teamId, entries, true), reason: 'resign', holder: null, room, ask, reserve, affordable: affordableWith(reserve) });
      continue;
    }
    // Players whose contracts ended leave with the market; a restricted one is a team option and still holds the spot.
    const holder = entries.find(e => e.playerId !== null && e.position === row.position && e.playerId !== playerId && !(isExpired(e, state.season) && !e.restricted));
    if (!holder) {
      const reserve = reserveFor(true);
      out.push({ teamId, strength: strengthOf(teamId), ...scored(teamId, entries, false), reason: 'need', holder: null, room, ask, reserve, affordable: affordableWith(reserve) });
    } else if (row.scale === 'FBA' && row.rating !== null && holder.rating !== null && row.rating >= holder.rating + UPGRADE_MARGIN && affordableWith(reserveFor(false))) {
      const reserve = reserveFor(false);
      out.push({ teamId, strength: strengthOf(teamId), ...scored(teamId, entries, false), reason: 'upgrade', holder: { playerId: holder.playerId!, name: nameOf(state, holder.playerId!), rating: holder.rating }, room, ask, reserve, affordable: true });
    }
  }
  return out.sort((a, b) => b.score.total - a.score.total || Number(b.affordable) - Number(a.affordable) || ORDER[a.reason] - ORDER[b.reason] || b.room - a.room || a.teamId.localeCompare(b.teamId));
}
