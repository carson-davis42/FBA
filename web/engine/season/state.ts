import type {
  AllStarFile, CalendarFile, PauseKind, PlayersFile, PlayoffsFile, RatingPauseFile, ResultsFile, RostersFile, ScheduleFile, SchedulePause, TeamsFile, TransactionsFile,
} from '../shared/types';
import type { SeasonLeague } from './schedule';

export interface SeasonState {
  league: SeasonLeague;
  season: number;
  teams: TeamsFile;
  rosters: RostersFile;
  players: PlayersFile;
  calendar: CalendarFile;
  tx: TransactionsFile;
  schedule: ScheduleFile | null;
  results: ResultsFile | null;
  /** The doc for the current (or next) rating pause, if it has been started. */
  ratingPause: RatingPauseFile | null;
  /** FBA only. */
  allstar: AllStarFile | null;
  /** This league's postseason, once the seeds are locked. */
  playoffs: PlayoffsFile | null;
}

export type SeasonDocKey = 'rosters' | 'calendar' | 'tx' | 'schedule' | 'results' | 'ratingPause' | 'allstar' | 'playoffs';

export function seasonDocPath(key: SeasonDocKey, league: SeasonLeague, season: number, afterGame?: number): string {
  switch (key) {
    case 'rosters': return `leagues/${league}/S${season}/rosters.json`;
    case 'calendar': return 'calendar.json';
    case 'tx': return `leagues/${league}/S${season}/transactions.json`;
    case 'schedule': return `leagues/${league}/S${season}/schedule.json`;
    case 'results': return `leagues/${league}/S${season}/results.json`;
    case 'playoffs': return `leagues/${league}/S${season}/playoffs.json`;
    case 'ratingPause':
      if (afterGame === undefined) throw new Error('A rating pause path needs its afterGame');
      return `leagues/fba/S${season}/ratingPause-${afterGame}.json`;
    case 'allstar': return `leagues/fba/S${season}/allstar.json`;
  }
}

export type SeasonResult =
  | { ok: true; state: SeasonState; changed: SeasonDocKey[]; label: string }
  | { ok: false; problems: string[] };

export const seasonFail = (problems: string[]): SeasonResult => ({ ok: false, problems });

export function seasonWrites(result: Extract<SeasonResult, { ok: true }>): { path: string; doc: unknown }[] {
  const s = result.state;
  return result.changed.map(k => ({ path: seasonDocPath(k, s.league, s.season, s.ratingPause?.afterGame), doc: s[k] }));
}

export const CALENDAR_STEP: Record<SeasonLeague, string> = { fba: 'fba', fbad2: 'fba-d2' };
export const schedulesStepId = (season: number) => `make-s${season}-schedules`;
export const PAUSE_LABEL: Record<PauseKind, string> = { ratings: 'rating adjustment', deadline: 'trade deadline', allstar: 'All-Star weekend' };

export const gamesPlayed = (state: SeasonState): number => state.results?.games.length ?? 0;

/** The first unfinished pause, in schedule order. */
export function nextPause(schedule: ScheduleFile | null): SchedulePause | null {
  return schedule?.pauses.find(p => !p.done) ?? null;
}

/** The unfinished pause that stops the next game, if one is due. */
export function blockingPause(state: SeasonState): SchedulePause | null {
  const p = nextPause(state.schedule);
  return p && p.afterGame <= gamesPlayed(state) ? p : null;
}

export function seasonOver(state: SeasonState): boolean {
  return !!state.schedule && state.schedule.games.length > 0 && gamesPlayed(state) >= state.schedule.games.length;
}

/** How many games can be played before the next pause or the end of the regular season. */
export function gamesUntilStop(state: SeasonState): number {
  if (!state.schedule) return 0;
  const played = gamesPlayed(state);
  const remaining = state.schedule.games.length - played;
  const p = nextPause(state.schedule);
  return Math.max(0, Math.min(remaining, p ? p.afterGame - played : remaining));
}

export function playerName(state: SeasonState, playerId: string): string {
  return state.players.players[playerId]?.name ?? 'Unnamed';
}
