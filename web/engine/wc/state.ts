import type { GameResult, RosterEntry } from '../shared/types';
import { POSITIONS } from '../roster/rules';
import type { SimTeam } from '../season/sim';

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
