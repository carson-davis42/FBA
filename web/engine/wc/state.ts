import type { GameResult, RosterEntry } from '../shared/types';
import { POSITIONS } from '../roster/rules';
import { simGame, type SimGame, type SimTeam } from '../season/sim';
import type { Rng } from '../d2/random';

export const qualifyingStepId = (season: number) => `s${season}-qualifying`;
export const worldCupStepId = (season: number) => `s${season}-world-cup`;

export type WcKey = 'rosters' | 'qualifying' | 'worldcup' | 'calendar';
export type WcResult<S> = { ok: true; state: S; changed: WcKey[]; label: string } | { ok: false; problems: string[] };
export const wcFail = (problems: string[]): { ok: false; problems: string[] } => ({ ok: false, problems });

/** Five players in PG..C order from a roster, ids `<teamId>:<position>` for generated ones. */
export function simTeam(teamId: string, roster: RosterEntry[]): SimTeam {
  const players = POSITIONS.map(position => {
    const e = roster.find(x => x.position === position);
    return { playerId: e?.playerId ?? `${teamId}:${position}`, position, rating: e?.rating ?? 0 };
  });
  return { teamId, players };
}

export function winnerOf(g: GameResult): string {
  return g.homePts > g.awayPts ? g.home : g.away;
}

export interface NextWcGame { gameNo: number; home: string; away: string }

/** Sims `next` with the countries' lineups, or a problem when a roster is missing. */
export function simWcGame(rosters: { teams: Record<string, RosterEntry[]> }, next: NextWcGame, rng: Rng): SimGame | string {
  const home = rosters.teams[next.home];
  const away = rosters.teams[next.away];
  if (!home || !away) return `${next.home} or ${next.away} has no roster`;
  return simGame(next.gameNo, simTeam(next.home, home), simTeam(next.away, away), rng);
}

/** A problem when a (live) sim isn't the game that is up next. */
export function simMismatch(next: NextWcGame, sim: SimGame): string | null {
  return sim.gameNo === next.gameNo && sim.home.teamId === next.home && sim.away.teamId === next.away ? null : 'That game is not the next one';
}
