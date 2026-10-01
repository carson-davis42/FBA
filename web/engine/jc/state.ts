import type { CalendarFile, JcAwardsFile, JcPostseasonFile, JcRankingsFile, JcScheduleFile, PlayersFile, RecruitingFile, ResultsFile, RostersFile, SummaryFile, TeamsFile } from '../shared/types';

export const DAYS = 29;
export const TEAMS_PER_DAY = 108;

export interface JcState {
  season: number;
  teams: TeamsFile;
  rosters: RostersFile;
  players: PlayersFile;
  calendar: CalendarFile;
  schedule: JcScheduleFile | null;
  results: ResultsFile | null;
  rankings: JcRankingsFile | null;
  postseason: JcPostseasonFile | null;
  awards: JcAwardsFile | null;
  summary: SummaryFile | null;
  /** The recruiting board of the class that plays this season (null when it doesn't exist). */
  board: RecruitingFile | null;
}

export type JcKey = 'rosters' | 'schedule' | 'results' | 'rankings' | 'postseason' | 'awards' | 'summary' | 'calendar';
export type JcResult = { ok: true; state: JcState; changed: JcKey[]; label: string } | { ok: false; problems: string[] };
export const jcFail = (problems: string[]): { ok: false; problems: string[] } => ({ ok: false, problems });

export const jcDocPath = (key: JcKey, season: number): string => (key === 'calendar' ? 'calendar.json' : `leagues/fbajc/S${season}/${key}.json`);

export function jcWrites(r: Extract<JcResult, { ok: true }>): { path: string; doc: unknown }[] {
  return r.changed.map(key => ({ path: jcDocPath(key, r.state.season), doc: r.state[key] }));
}

export const gamesPlayed = (s: JcState): number => s.results?.games.length ?? 0;

/** Number of fully played days: a day is played when every one of its games has a result. */
export function dayPlayed(s: JcState): number {
  if (!s.schedule) return 0;
  const done = new Set((s.results?.games ?? []).map(g => g.gameNo));
  const days = [...s.schedule.days].sort((a, b) => a.day - b.day);
  let n = 0;
  for (const d of days) {
    if (d.games.length === 0 || !d.games.every(g => done.has(g.gameNo))) break;
    n++;
  }
  return n;
}

export const conferenceOf = (teams: TeamsFile, teamId: string): string =>
  teams.teams.find(t => t.teamId === teamId)?.group ?? '';
