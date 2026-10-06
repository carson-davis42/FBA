import type { GameResult, StreakRecord } from '../shared/types';

export type { StreakRecord };

/** The first season whose games are tracked: earlier seasons have only standings and brackets, so their streaks are the hand-entered records. */
export const STREAK_TRACKING_START = 79;

export interface StreakRun {
  teamId: string;
  kind: 'W' | 'L';
  length: number;
  fromSeason: number;
  toSeason: number;
  /** How many of its games were playoff games. */
  playoffGames: number;
  /** Still running: the team's last game extended it. */
  active: boolean;
}

export interface TrackedSeason { season: number; regular: GameResult[]; playoffs: GameResult[] }

export interface StreakEntry {
  rank: number;
  teamId: string;
  /** The name the team went by (recorded entries only; tracked streaks use the franchise's era name). */
  name: string | null;
  kind: 'W' | 'L';
  length: number;
  fromSeason: number;
  toSeason: number;
  playoffGames: number;
  source: 'record' | 'tracked';
  active: boolean;
}

/**
 * Every win and losing streak in the games given, oldest season first, each season's regular season and then its playoffs. A streak carries over from
 * the regular season into the playoffs and on into the next season. The result lists every run, closed ones in the order they ended and the active
 * ones last.
 */
export function trackStreaks(seasons: TrackedSeason[]): StreakRun[] {
  const open = new Map<string, StreakRun>();
  const closed: StreakRun[] = [];
  const apply = (teamId: string, kind: 'W' | 'L', season: number, playoff: boolean) => {
    const cur = open.get(teamId);
    if (cur && cur.kind === kind) {
      cur.length++;
      cur.toSeason = season;
      if (playoff) cur.playoffGames++;
      return;
    }
    if (cur) closed.push({ ...cur, active: false });
    open.set(teamId, { teamId, kind, length: 1, fromSeason: season, toSeason: season, playoffGames: playoff ? 1 : 0, active: true });
  };
  for (const { season, regular, playoffs } of [...seasons].sort((a, b) => a.season - b.season)) {
    for (const [games, playoff] of [[regular, false], [playoffs, true]] as const) {
      for (const g of [...games].sort((a, b) => a.gameNo - b.gameNo)) {
        const homeWon = g.homePts > g.awayPts;
        apply(g.home, homeWon ? 'W' : 'L', season, playoff);
        apply(g.away, homeWon ? 'L' : 'W', season, playoff);
      }
    }
  }
  return [...closed, ...open.values()];
}

/** The streak each team is on now, longest first. */
export function currentStreaks(runs: StreakRun[]): StreakRun[] {
  return runs.filter(r => r.active).sort((a, b) => b.length - a.length || a.teamId.localeCompare(b.teamId));
}

/**
 * The longest streaks of one kind, mixing the hand-entered records with the tracked ones. Equal lengths share a rank (earlier seasons first), and a tie
 * at the cut-off stays on the list.
 */
export function allTimeStreaks(records: StreakRecord[], runs: StreakRun[], kind: 'W' | 'L', limit: number): StreakEntry[] {
  const all: Omit<StreakEntry, 'rank'>[] = [
    ...records.filter(r => r.kind === kind).map(r => ({ teamId: r.teamId, name: r.name, kind, length: r.length, fromSeason: r.fromSeason, toSeason: r.toSeason, playoffGames: 0, source: 'record' as const, active: false })),
    ...runs.filter(r => r.kind === kind).map(r => ({ teamId: r.teamId, name: null, kind, length: r.length, fromSeason: r.fromSeason, toSeason: r.toSeason, playoffGames: r.playoffGames, source: 'tracked' as const, active: r.active })),
  ].sort((a, b) => b.length - a.length || a.fromSeason - b.fromSeason || a.teamId.localeCompare(b.teamId));
  const ranked = all.map((e, i) => ({ ...e, rank: i > 0 && all[i - 1].length === e.length ? 0 : i + 1 }));
  for (let i = 0; i < ranked.length; i++) if (ranked[i].rank === 0) ranked[i].rank = ranked[i - 1].rank;
  const cut = ranked[limit - 1]?.rank ?? Infinity;
  return ranked.filter(e => e.rank <= cut);
}

/** "S79" or "S33–S38". */
export const seasonSpan = (from: number, to: number): string => (from === to ? `S${from}` : `S${from}–S${to}`);
