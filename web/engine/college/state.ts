import type { CalendarFile, PlayersFile, RecruitingFile, RostersFile, TeamsFile, TransactionsFile } from '../shared/types';

/** Everything the recruiting page reads and writes for the class created in calendar season `season`. */
export interface RecruitingState {
  season: number;
  recruiting: RecruitingFile;
  /** This season's FBAJC rosters. */
  rosters: RostersFile;
  /** The FBAJC schools (read-only). */
  teams: TeamsFile;
  players: PlayersFile;
  /** This season's FBAJC transactions. */
  tx: TransactionsFile;
  calendar: CalendarFile;
}

export type RecruitingDocKey = 'recruiting' | 'rosters' | 'players' | 'tx' | 'calendar';

export function recruitingDocPath(key: RecruitingDocKey, season: number): string {
  switch (key) {
    case 'recruiting': return `leagues/fbajc/S${season}/recruiting.json`;
    case 'rosters': return `leagues/fbajc/S${season}/rosters.json`;
    case 'tx': return `leagues/fbajc/S${season}/transactions.json`;
    case 'players': return 'players.json';
    case 'calendar': return 'calendar.json';
  }
}

export type RecruitingResult =
  | { ok: true; state: RecruitingState; changed: RecruitingDocKey[]; label: string }
  | { ok: false; problems: string[] };

export const recruitingFail = (problems: string[]): RecruitingResult => ({ ok: false, problems });

/** The batch writes for a successful result: one per changed document. */
export function recruitingWrites(result: Extract<RecruitingResult, { ok: true }>): { path: string; doc: unknown }[] {
  return result.changed.map(k => ({ path: recruitingDocPath(k, result.state.season), doc: result.state[k] }));
}

/** A new recruiting doc for the class created in `season` (it plays its Freshman year in that season's FBAJC). */
export function emptyRecruiting(season: number): RecruitingFile {
  return { league: 'fbajc', season, classOf: season + 1, locked: false, classDraft: [], created: false, recruits: [], portal: [] };
}

/** A college player's name; unnamed players are "X", as in the Java. */
export function collegeName(players: PlayersFile, playerId: string): string {
  return players.players[playerId]?.name ?? 'X';
}

export function schoolName(state: RecruitingState, teamId: string): string {
  return state.teams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
}

export function schoolAbbr(state: RecruitingState, teamId: string): string {
  return state.teams.teams.find(t => t.teamId === teamId)?.abbr ?? teamId;
}
