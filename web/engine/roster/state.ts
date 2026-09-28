import type {
  FreeAgentsFile, PicksFile, PlayersFile, ReservesFile, RosterEntry, RostersFile, TransactionsFile, TransactionType,
} from '../shared/types';
import type { SeasonPhase } from '../season/locks';

export interface RosterState {
  season: number;
  fba: RostersFile;
  d2: RostersFile;
  freeAgents: FreeAgentsFile;
  reserves: ReservesFile;
  picks: PicksFile;
  players: PlayersFile;
  fbaTx: TransactionsFile;
  d2Tx: TransactionsFile;
}

export type DocKey = Exclude<keyof RosterState, 'season'>;

export const DOC_KEYS: DocKey[] = ['fba', 'd2', 'freeAgents', 'reserves', 'picks', 'players', 'fbaTx', 'd2Tx'];

export function docPath(key: DocKey, season: number): string {
  switch (key) {
    case 'fba': return `leagues/fba/S${season}/rosters.json`;
    case 'd2': return `leagues/fbad2/S${season}/rosters.json`;
    case 'freeAgents': return `leagues/fba/S${season}/freeAgents.json`;
    case 'reserves': return `leagues/fbad2/S${season}/reserves.json`;
    case 'picks': return 'leagues/fba/picks.json';
    case 'players': return 'players.json';
    case 'fbaTx': return `leagues/fba/S${season}/transactions.json`;
    case 'd2Tx': return `leagues/fbad2/S${season}/transactions.json`;
  }
}

export interface MoveContext {
  batchId: string;
  /** The season phase for roster locks; omitted means the offseason (nothing locked). */
  phase?: SeasonPhase;
}

export type MoveResult =
  | { ok: true; state: RosterState; changed: DocKey[]; label: string; warnings: string[] }
  | { ok: false; problems: string[] };

export const fail = (problems: string[]): MoveResult => ({ ok: false, problems });

export function nameOf(state: RosterState, playerId: string): string {
  return state.players.players[playerId]?.name ?? 'Unnamed';
}

export function appendTx(tx: TransactionsFile, ctx: MoveContext, type: TransactionType, teams: string[], lines: string[]): TransactionsFile {
  const seq = tx.entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  return { ...tx, entries: [...tx.entries, { seq, batchId: ctx.batchId, type, teams, lines }] };
}

export function findOnRoster(r: RostersFile, playerId: string): { teamId: string; index: number; entry: RosterEntry } | null {
  for (const [teamId, entries] of Object.entries(r.teams)) {
    const index = entries.findIndex(e => e.playerId === playerId);
    if (index >= 0) return { teamId, index, entry: entries[index] };
  }
  return null;
}

export function withTeam(r: RostersFile, teamId: string, entries: RosterEntry[]): RostersFile {
  return { ...r, teams: { ...r.teams, [teamId]: entries } };
}

/** Replaces one pro league's rosters and transactions without computed-key spreads, so the RosterState type stays exact. */
export function withLeague(state: RosterState, league: 'fba' | 'fbad2', rosters: RostersFile, tx: TransactionsFile): RosterState {
  return league === 'fba' ? { ...state, fba: rosters, fbaTx: tx } : { ...state, d2: rosters, d2Tx: tx };
}
