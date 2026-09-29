import type { CalendarFile, PlayersFile, RecruitingFile, RostersFile, TeamsFile, TransactionsFile } from '../shared/types';

/** Everything the recruiting page reads and writes. `season` is the calendar season (rosters and tx); `recruiting.season` is where the board lives. */
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

/** leagues/fbajc/S{season}/recruiting.json: the board of the class created in `season` (it plays in season + 1). */
export const boardPath = (season: number) => `leagues/fbajc/S${season}/recruiting.json`;
/** In calendar season n: the class that plays this season (board S{n−1}) and the next class (board S{n}). */
export const currentClassBoardSeason = (n: number) => n - 1;
export const nextClassBoardSeason = (n: number) => n;
/** True when the board's class plays in the state's season (commits go onto this season's rosters). */
export const playsThisSeason = (s: RecruitingState) => s.recruiting.classOf === s.season;

export type RecruitingDocKey = 'recruiting' | 'rosters' | 'players' | 'tx' | 'calendar';

export function recruitingDocPath(key: RecruitingDocKey, season: number): string {
  switch (key) {
    case 'recruiting': return boardPath(season);
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
  return result.changed.map(k => ({
    path: recruitingDocPath(k, k === 'recruiting' ? result.state.recruiting.season : result.state.season),
    doc: result.state[k],
  }));
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
