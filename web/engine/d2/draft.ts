import { POSITIONS } from '../roster/rules';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import type { D2DraftFile, D2Pick, Position, ReservePlayer } from '../shared/types';
import { compareRank } from './pool';
import { shuffle, type Rng } from './random';
import { d2Fail, d2Name, type D2Result, type D2State } from './state';

export function onTheClock(draft: D2DraftFile | null): { pickNo: number; teamId: string } | null {
  if (!draft || draft.locked) return null;
  const teamId = draft.tickets[draft.picks.length];
  return teamId === undefined ? null : { pickNo: draft.picks.length + 1, teamId };
}

export function neededPositions(state: D2State, teamId: string): Position[] {
  const entries = state.d2.teams[teamId] ?? [];
  return POSITIONS.filter(p => entries.some(e => e.position === p && e.playerId === null));
}

/** Draft-pool players still in Reserves at a position this team needs, best first. */
export function availableFor(state: D2State, teamId: string): ReservePlayer[] {
  if (!state.draft) return [];
  const needs = new Set(neededPositions(state, teamId));
  const inPool = new Set(state.draft.pool);
  return state.reserves.players
    .filter(p => needs.has(p.position) && inPool.has(p.playerId))
    .map(p => ({ p, key: { rating: p.rating, age: p.age, name: d2Name(state, p.playerId) } }))
    .sort((a, b) => compareRank(a.key, b.key))
    .map(x => x.p);
}

function noClock(state: D2State): D2Result {
  return d2Fail([state.draft ? 'The draft is finished' : 'Lock the pool first']);
}

/** Appends the pick, logs it, and finishes the draft (and its calendar step) after the last ticket. */
function recordPick(state: D2State, ctx: MoveContext, pick: D2Pick, line: string, label: string): Extract<D2Result, { ok: true }> {
  const draft = state.draft!;
  const picks = [...draft.picks, pick];
  const done = picks.length === draft.tickets.length;
  return {
    ok: true,
    state: {
      ...state,
      draft: { ...draft, picks, locked: done },
      d2Tx: appendTx(state.d2Tx, ctx, 'drafted', [pick.teamId], [line]),
      calendar: done ? markStepDone(state.calendar, 'fbad2-draft') : state.calendar,
    },
    changed: done ? ['d2', 'reserves', 'draft', 'd2Tx', 'calendar'] : ['d2', 'reserves', 'draft', 'd2Tx'],
    label,
  };
}

export function makePick(state: D2State, playerId: string, ctx: MoveContext): D2Result {
  const clock = onTheClock(state.draft);
  if (!clock) return noClock(state);
  const name = d2Name(state, playerId);
  const player = availableFor(state, clock.teamId).find(p => p.playerId === playerId);
  if (!player) return d2Fail([`${name} can't be drafted by ${clock.teamId}: not in the draft pool at a position they need`]);
  const entries = state.d2.teams[clock.teamId];
  const slot = entries.findIndex(e => e.position === player.position && e.playerId === null);
  const filled = entries.map((e, i) => (i === slot ? { playerId, position: player.position, rating: player.rating, age: player.age, points: 0 } : e));
  const next: D2State = {
    ...state,
    d2: { ...state.d2, teams: { ...state.d2.teams, [clock.teamId]: filled } },
    reserves: { ...state.reserves, players: state.reserves.players.filter(p => p.playerId !== playerId) },
  };
  return recordPick(
    next, ctx, { teamId: clock.teamId, playerId, position: player.position },
    `D2 Draft #${clock.pickNo}: ${clock.teamId} selects ${player.position}-${name}`,
    `D2 draft #${clock.pickNo}: ${clock.teamId} selects ${name}`,
  );
}

export function skipPick(state: D2State, ctx: MoveContext): D2Result {
  const clock = onTheClock(state.draft);
  if (!clock) return noClock(state);
  if (availableFor(state, clock.teamId).length) return d2Fail(['Skip is only allowed when no eligible player is left']);
  const r = recordPick(
    state, ctx, { teamId: clock.teamId, playerId: null, position: null },
    `D2 Draft #${clock.pickNo}: ${clock.teamId} skips (no eligible player)`,
    `D2 draft #${clock.pickNo}: ${clock.teamId} skips`,
  );
  return { ...r, changed: r.changed.filter(k => k !== 'd2' && k !== 'reserves') };
}

export function rerollOrder(state: D2State, rng: Rng): D2Result {
  const draft = state.draft;
  if (!draft || draft.locked) return d2Fail(['There is no draft order to re-roll']);
  if (draft.picks.length) return d2Fail(['The order can only be re-rolled before the first pick']);
  return { ok: true, state: { ...state, draft: { ...draft, tickets: shuffle(draft.tickets, rng) } }, changed: ['draft'], label: 'Re-roll D2 draft order' };
}

export const isDraftPickLabel = (label: string | null): boolean => label !== null && label.startsWith('D2 draft #');
