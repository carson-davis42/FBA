import type { GameResult, RosterEntry } from '../shared/types';
import { POSITIONS } from '../roster/rules';
import { simGame, type SimGame, type SimTeam } from '../season/sim';
import type { Rng } from '../d2/random';

export const qualifyingStepId = (season: number) => `s${season}-qualifying`;
export const worldCupStepId = (season: number) => `s${season}-world-cup`;

export type WcKey = 'rosters' | 'qualifying' | 'worldcup' | 'calendar';
export type WcResult<S> = { ok: true; state: S; changed: WcKey[]; label: string } | { ok: false; problems: string[] };
export const wcFail = (problems: string[]): { ok: false; problems: string[] } => ({ ok: false, problems });

/** Why a roster can't take the floor: every position needs a rated player. Derived rosters fill gaps with generated players, so this only shows for a damaged roster file. */
function lineupProblem(teamId: string, roster: RosterEntry[]): string | null {
  for (const position of POSITIONS) {
    const e = roster.find(x => x.position === position)
    if (!e || e.rating === null) return `${teamId} has no rated ${position}`
  }
  return null
}

/** Five players in PG..C order from a roster, ids `<teamId>:<position>` for generated ones. A missing or unrated position is an error, never a rating-0 player. */
export function simTeam(teamId: string, roster: RosterEntry[]): SimTeam {
  const problem = lineupProblem(teamId, roster)
  if (problem) throw new Error(problem)
  const players = POSITIONS.map(position => {
    const e = roster.find(x => x.position === position)!
    return { playerId: e.playerId ?? `${teamId}:${position}`, position, rating: e.rating! }
  })
  return { teamId, players }
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
  const problem = lineupProblem(next.home, home) ?? lineupProblem(next.away, away);
  if (problem) return problem;
  return simGame(next.gameNo, simTeam(next.home, home), simTeam(next.away, away), rng);
}

/** A problem when a (live) sim isn't the game that is up next. */
export function simMismatch(next: NextWcGame, sim: SimGame): string | null {
  return sim.gameNo === next.gameNo && sim.home.teamId === next.home && sim.away.teamId === next.away ? null : 'That game is not the next one';
}
