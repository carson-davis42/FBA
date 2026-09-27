import type {
  CalendarFile, D2DraftFile, D2PoolFile, D2RatingsFile, PlayersFile, Position, ReservesFile, RostersFile, TransactionsFile,
} from '../shared/types';

/** Everything the D2 ratings reset, pool, and draft read and write for one season. */
export interface D2State {
  season: number;
  d2: RostersFile;
  reserves: ReservesFile;
  d2Tx: TransactionsFile;
  players: PlayersFile;
  calendar: CalendarFile;
  /** Last season's D2 rosters (read-only, for performance). Null if missing. */
  prevD2: RostersFile | null;
  /** True once FBA free agency is closed (the FBA freeAgents doc is locked). */
  freeAgencyClosed: boolean;
  ratings: D2RatingsFile | null;
  pool: D2PoolFile | null;
  draft: D2DraftFile | null;
}

export type D2DocKey = 'd2' | 'reserves' | 'd2Tx' | 'calendar' | 'ratings' | 'pool' | 'draft';

export function d2DocPath(key: D2DocKey, season: number): string {
  switch (key) {
    case 'd2': return `leagues/fbad2/S${season}/rosters.json`;
    case 'reserves': return `leagues/fbad2/S${season}/reserves.json`;
    case 'd2Tx': return `leagues/fbad2/S${season}/transactions.json`;
    case 'calendar': return 'calendar.json';
    case 'ratings': return `leagues/fbad2/S${season}/ratings.json`;
    case 'pool': return `leagues/fbad2/S${season}/pool.json`;
    case 'draft': return `leagues/fbad2/S${season}/draft.json`;
  }
}

export type D2Result =
  | { ok: true; state: D2State; changed: D2DocKey[]; label: string }
  | { ok: false; problems: string[] };

export const d2Fail = (problems: string[]): D2Result => ({ ok: false, problems });

export function d2Name(state: D2State, playerId: string): string {
  return state.players.players[playerId]?.name ?? 'Unnamed';
}

/** The batch writes for a successful result: one per changed document. */
export function d2Writes(result: Extract<D2Result, { ok: true }>): { path: string; doc: unknown }[] {
  return result.changed.map(k => ({ path: d2DocPath(k, result.state.season), doc: result.state[k] }));
}

export interface PoolMember {
  playerId: string;
  position: Position;
  age: number | null;
  rating: number | null;
  /** D2 team id, or null for Reserves. */
  team: string | null;
}

/** Everyone in the D2 pool: roster players (team order, then slot order), then Reserves. */
export function poolMembers(state: D2State): PoolMember[] {
  const out: PoolMember[] = [];
  for (const [teamId, entries] of Object.entries(state.d2.teams)) {
    for (const e of entries) {
      if (e.playerId) out.push({ playerId: e.playerId, position: e.position, age: e.age, rating: e.rating, team: teamId });
    }
  }
  for (const p of state.reserves.players) out.push({ playerId: p.playerId, position: p.position, age: p.age, rating: p.rating, team: null });
  return out;
}
