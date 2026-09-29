import type { Rng } from '../d2/random';
import { randInt } from '../d2/random';
import { appendTx, type MoveContext } from '../roster/state';
import { calendarProblem } from '../season/moves';
import type { RosterEntry, RostersFile } from '../shared/types';
import { fbajcGateProblem } from './recruiting';
import { playsThisSeason, recruitingFail, type RecruitingResult, type RecruitingState } from './state';

/** Team.java: (int)(random*13) + base. */
export const WALK_ON_BASE: Record<string, number> = { B12: 60, ACC: 60, BE: 60, SEC: 60, B10: 60, P12: 60, AAC: 58, A10: 58, MWC: 58 };
export const walkOnBase = (group: string | null) => WALK_ON_BASE[group ?? ''] ?? 55;

/** Empty college slots across every roster. */
export function openSpots(rosters: RostersFile): number {
  return Object.values(rosters.teams).reduce((n, entries) => n + entries.filter(e => e.playerId === null).length, 0);
}

/** Why walk-ons can't be filled yet, or null. */
export function walkOnProblem(state: RecruitingState): string | null {
  const step = calendarProblem(state.calendar, 'fbajc', 'Walk-ons are filled');
  if (step) return step;
  if (!playsThisSeason(state)) return "Walk-ons fill this season's rosters";
  const gate = fbajcGateProblem(state.recruiting, null);
  if (gate) return gate;
  return openSpots(state.rosters) === 0 ? 'There are no open spots' : null;
}

/** Fills every open spot with a new unnamed Freshman walk-on rated base + 0..12 by conference (Team.java). */
export function fillWalkOns(state: RecruitingState, rng: Rng, ctx: MoveContext): RecruitingResult {
  const problem = walkOnProblem(state);
  if (problem) return recruitingFail([problem]);
  let nextId = state.players.nextId;
  const people = { ...state.players.players };
  const teams: Record<string, RosterEntry[]> = {};
  const filled: string[] = [];
  let count = 0;
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    const group = state.teams.teams.find(t => t.teamId === teamId)?.group ?? null;
    let touched = false;
    teams[teamId] = entries.map(e => {
      if (e.playerId !== null) return e;
      const id = `p${String(nextId++).padStart(5, '0')}`;
      people[id] = { id, name: null, birthSeason: state.season - 18 };
      count++;
      touched = true;
      return { playerId: id, position: e.position, rating: walkOnBase(group) + randInt(rng, 0, 12), age: null, points: 0, stars: null, classYear: 'Fr' };
    });
    if (touched) filled.push(teamId);
  }
  const line = count === 1 ? '1 walk-on fills an open spot' : `${count} walk-ons fill open spots`;
  return {
    ok: true,
    state: {
      ...state,
      rosters: { ...state.rosters, teams },
      players: { nextId, players: people },
      tx: appendTx(state.tx, ctx, 'walk-on', filled, [line]),
    },
    changed: ['rosters', 'players', 'tx'],
    label: `Fill ${count} open ${count === 1 ? 'spot' : 'spots'} with walk-ons`,
  };
}
