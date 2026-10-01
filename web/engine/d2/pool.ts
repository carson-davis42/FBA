import { POSITIONS, vacantEntry } from '../roster/rules';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import { D2_POSITION_SPOTS, type D2DraftFile, type D2PoolFile, type Position, type RosterEntry } from '../shared/types';
import { shuffle, type Rng } from './random';
import { d2Fail, d2Name, poolMembers, type D2Result, type D2State } from './state';

/** The top this many at each position make the D2. */
export const POOL_CUTOFF = D2_POSITION_SPOTS;

export type PoolOrder = D2PoolFile['order'];

type Rankable = { rating: number | null; age: number | null; name: string };

/** Best first: higher rating, then younger, then name. Unknown ratings and ages sort last. */
export function compareRank(a: Rankable, b: Rankable): number {
  const byRating = (b.rating ?? -1) - (a.rating ?? -1);
  if (byRating) return byRating;
  const byAge = (a.age ?? 999) - (b.age ?? 999);
  if (byAge) return byAge;
  return a.name.localeCompare(b.name);
}

export function rankedOrder(state: D2State): PoolOrder {
  const members = poolMembers(state).map(m => ({ ...m, name: d2Name(state, m.playerId) }));
  const at = (pos: Position) => members.filter(m => m.position === pos).sort(compareRank).map(m => m.playerId);
  return { PG: at('PG'), SG: at('SG'), SF: at('SF'), PF: at('PF'), C: at('C') };
}

export function startPool(state: D2State): D2Result {
  if (!state.ratings?.locked) return d2Fail(['Finish D2 ratings first']);
  if (state.pool) return d2Fail(['The pool has already been started']);
  const pool: D2PoolFile = { league: 'fbad2', season: state.season, locked: false, order: rankedOrder(state) };
  return { ok: true, state: { ...state, pool }, changed: ['pool'], label: 'Start D2 pool' };
}

/** Moves the player at `from` to `to` within one position. Out-of-range moves return the pool unchanged. */
export function moveInOrder(pool: D2PoolFile, position: Position, from: number, to: number): D2PoolFile {
  const list = pool.order[position];
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return pool;
  const next = [...list];
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id);
  return { ...pool, order: { ...pool.order, [position]: next } };
}

/** Differences between the saved order and who is actually in the pool. Any problem blocks Lock pool. */
export function poolProblems(state: D2State): string[] {
  if (!state.pool) return ['Start the pool first'];
  const out: string[] = [];
  const members = poolMembers(state);
  for (const pos of POSITIONS) {
    const here = new Set(members.filter(m => m.position === pos).map(m => m.playerId));
    const seen = new Set<string>();
    for (const id of state.pool.order[pos]) {
      if (seen.has(id)) out.push(`${d2Name(state, id)} is listed twice at ${pos}`);
      seen.add(id);
      if (!here.has(id)) out.push(`${d2Name(state, id)} is in the ${pos} order but not in the D2 pool at ${pos}`);
    }
    for (const id of here) if (!seen.has(id)) out.push(`${d2Name(state, id)} (${pos}) is missing from the pool order`);
  }
  if (out.length) out.push('Use "Reset to ratings order" to rebuild the order');
  return out;
}

/** Everyone rated the same as the last player above the line, but only when that tie crosses the line. */
export function cutoffTies(state: D2State, position: Position, cutoff = POOL_CUTOFF): string[] {
  const list = state.pool?.order[position] ?? [];
  if (list.length <= cutoff) return [];
  const rating = new Map(poolMembers(state).map(m => [m.playerId, m.rating]));
  const line = rating.get(list[cutoff - 1]) ?? null;
  if (line === null || !list.slice(cutoff).some(id => rating.get(id) === line)) return [];
  return list.filter(id => rating.get(id) === line);
}

export interface PositionSummary {
  pool: number;
  kept: number;
  bumped: number;
  draftPool: number;
  openSlots: number;
}

export function poolSummary(state: D2State, cutoff = POOL_CUTOFF): Record<Position, PositionSummary> {
  const members = poolMembers(state);
  const teamOf = new Map(members.map(m => [m.playerId, m.team]));
  const out = {} as Record<Position, PositionSummary>;
  for (const pos of POSITIONS) {
    const list = state.pool?.order[pos] ?? [];
    const top = new Set(list.slice(0, cutoff));
    const roster = members.filter(m => m.position === pos && m.team !== null);
    const kept = roster.filter(m => top.has(m.playerId)).length;
    const vacantNow = Object.values(state.d2.teams).filter(es => es.some(e => e.position === pos && e.playerId === null)).length;
    out[pos] = {
      pool: list.length,
      kept,
      bumped: roster.length - kept,
      draftPool: [...top].filter(id => teamOf.get(id) === null).length,
      openSlots: vacantNow + roster.length - kept,
    };
  }
  return out;
}

export function poolWarnings(state: D2State, cutoff = POOL_CUTOFF): string[] {
  const s = poolSummary(state, cutoff);
  return POSITIONS.filter(p => s[p].draftPool < s[p].openSlots).map(p =>
    `${p}: ${s[p].openSlots} open slot(s) but only ${s[p].draftPool} player(s) in the draft pool; some slots will stay empty`);
}

export function lockPool(state: D2State, ctx: MoveContext, rng: Rng, cutoff = POOL_CUTOFF): D2Result {
  if (!state.pool) return d2Fail(['Start the pool first']);
  if (state.pool.locked) return d2Fail(['The pool is already locked']);
  if (state.draft) return d2Fail(['The draft has already been created']);
  const problems = poolProblems(state);
  if (problems.length) return d2Fail(problems);
  const pool = state.pool;
  const top = new Set(POSITIONS.flatMap(pos => pool.order[pos].slice(0, cutoff)));

  const bumped: { teamId: string; entry: RosterEntry }[] = [];
  const teams = Object.fromEntries(Object.entries(state.d2.teams).map(([teamId, entries]) => [teamId, entries.map(e => {
    if (e.playerId === null || top.has(e.playerId)) return e;
    bumped.push({ teamId, entry: e });
    return vacantEntry(e.position, 'fbad2');
  })]));

  const reserveIds = new Set(state.reserves.players.map(p => p.playerId));
  const draftPool = POSITIONS.flatMap(pos => pool.order[pos].slice(0, cutoff).filter(id => reserveIds.has(id)));
  const reserves = {
    ...state.reserves,
    players: [
      ...state.reserves.players,
      ...bumped.map(b => ({ playerId: b.entry.playerId!, position: b.entry.position, age: b.entry.age, rating: b.entry.rating })),
    ],
  };
  const tickets = shuffle(Object.entries(teams).flatMap(([teamId, entries]) => entries.filter(e => e.playerId === null).map(() => teamId)), rng);
  const done = tickets.length === 0;
  const draft: D2DraftFile = { league: 'fbad2', season: state.season, locked: done, tickets, pool: draftPool, picks: [] };
  const d2Tx = appendTx(state.d2Tx, ctx, 'd2-pool', [...new Set(bumped.map(b => b.teamId))], [
    `D2 pool locked: ${draftPool.length} in the draft pool, ${bumped.length} bumped`,
    ...bumped.map(b => `Bumped to Reserves: ${b.entry.position}-${d2Name(state, b.entry.playerId!)} (${b.teamId})`),
  ]);
  return {
    ok: true,
    state: {
      ...state,
      d2: { ...state.d2, teams },
      reserves,
      pool: { ...pool, locked: true },
      draft,
      d2Tx,
      calendar: done ? markStepDone(state.calendar, 'fbad2-draft') : state.calendar,
    },
    changed: done ? ['d2', 'reserves', 'pool', 'draft', 'd2Tx', 'calendar'] : ['d2', 'reserves', 'pool', 'draft', 'd2Tx'],
    label: 'Lock D2 pool',
  };
}
