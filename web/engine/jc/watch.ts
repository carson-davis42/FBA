import type { Rng } from '../d2/random';
import { leagueRefRating } from '../awards/defense';
import { calendarProblem } from '../season/moves';
import { JC_HOME_PROFILE, JC_PROFILE, simGame, type SimGame } from '../season/sim';
import type { JcPostseasonFile } from '../shared/types';
import { playableGames, recordResult } from './bracket';
import { postseasonGames } from './confTourney';
import { applySim, isNeutralDay, lineupOf, newBook, regularSeasonOver } from './play';
import { blendRankings } from './rankings';
import { TEAMS_PER_DAY, TOTAL_GAMES, jcFail, type JcKey, type JcResult, type JcState } from './state';
import { dayGames } from './tournaments';

export interface NextJcGame { gameNo: number; home: string; away: string; day: number }

/**
 * The first unplayed game of the first day that isn't finished, or why there isn't one. With `tournamentId`, the first unplayed game of
 * that preseason tournament on that day (the games of one day are independent, so any tournament can be played on its own).
 */
export function nextJcGame(state: JcState, tournamentId?: string): NextJcGame | string {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return problem;
  if (!state.schedule) return 'Make the schedule first';
  if (regularSeasonOver(state)) return 'The regular season is over';
  const done = new Set((state.results?.games ?? []).map(g => g.gameNo));
  for (const d of [...state.schedule.days].sort((a, b) => a.day - b.day)) {
    const g = d.games.find(x => !done.has(x.gameNo) && (tournamentId === undefined || x.tournament === tournamentId));
    if (g) return { gameNo: g.gameNo, home: g.home, away: g.away, day: d.day };
    if (d.games.length === 0) return `The games for day ${d.day} are drawn when day ${d.day - 1} is finished`;
    if (tournamentId !== undefined && d.games.some(x => !done.has(x.gameNo))) return 'That tournament has no games left today';
  }
  return 'The regular season is over';
}

/** A game of the open day (the first day that isn't finished) that hasn't been played: any of them may be watched, in any order. */
export function openJcGame(state: JcState, gameNo: number): NextJcGame | string {
  const first = nextJcGame(state);
  if (typeof first === 'string') return first;
  const day = state.schedule!.days.find(d => d.day === first.day)!;
  const done = new Set((state.results?.games ?? []).map(g => g.gameNo));
  const g = day.games.find(x => x.gameNo === gameNo && !done.has(x.gameNo));
  return g ? { gameNo: g.gameNo, home: g.home, away: g.away, day: day.day } : "That game isn't open to play";
}

/**
 * Records a watched regular-season game, which must be an unplayed game of the open day. When it finishes its day the day's ranking
 * snapshot is added and, for tournament days 2 and 3, the next day's games are drawn.
 */
export function recordJcGame(state: JcState, sim: SimGame, rng: Rng): JcResult {
  const next = openJcGame(state, sim.gameNo);
  if (typeof next === 'string') return jcFail([next]);
  if (sim.home.teamId !== next.home || sim.away.teamId !== next.away) return jcFail(['That game is not open to play']);
  const book = newBook(state);
  const result = applySim(book, sim, rng, leagueRefRating(state.rosters), true);
  const games = [...(state.results?.games ?? []), result].sort((a, b) => a.gameNo - b.gameNo);
  const done = new Set(games.map(g => g.gameNo));
  const day = state.schedule!.days.find(d => d.day === next.day)!;
  const changed: JcKey[] = ['results', 'rosters'];
  let schedule = state.schedule!;
  let rankings = state.rankings ?? { league: 'fbajc' as const, season: state.season, locked: false, snapshots: [] };
  if (day.games.every(g => done.has(g.gameNo))) {
    const order = blendRankings({ teams: book.teamIds, ratings: book.ratings, games, totalGames: TOTAL_GAMES }, rng);
    rankings = { ...rankings, snapshots: [...rankings.snapshots, { afterDay: next.day, order }] };
    changed.push('rankings');
    const after = next.day + 1;
    const nextDay = schedule.days.find(d => d.day === after);
    if (nextDay && nextDay.games.length === 0 && (after === 2 || after === 3)) {
      try {
        const built = dayGames(after, schedule.tournaments, games, (after - 1) * TEAMS_PER_DAY + 1, rng)
          .map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, tournament: g.tournament }));
        schedule = { ...schedule, days: schedule.days.map(d => (d.day === after ? { ...d, games: built } : d)) };
        changed.push('schedule');
      } catch (e) {
        return jcFail([(e as Error).message]);
      }
    }
  }
  return {
    ok: true,
    state: {
      ...state, schedule,
      rosters: { ...state.rosters, teams: book.rosters },
      results: { league: 'fbajc', season: state.season, locked: state.results?.locked ?? false, games },
      rankings,
    },
    changed,
    label: `Game ${next.gameNo}: ${next.away} ${result.awayPts}-${result.homePts} ${next.home}`,
  };
}

/** Sims the next open game (or the next game of one tournament) without watching it, and records it like a watched game. */
export function quickSimNext(state: JcState, rng: Rng, tournamentId?: string): JcResult {
  const next = nextJcGame(state, tournamentId);
  if (typeof next === 'string') return jcFail([next]);
  const home = lineupOf(state.rosters.teams[next.home], next.home);
  const away = lineupOf(state.rosters.teams[next.away], next.away);
  if (typeof home === 'string') return jcFail([home]);
  if (typeof away === 'string') return jcFail([away]);
  const kind = state.schedule!.days.find(d => d.day === next.day)?.kind;
  return recordJcGame(state, simGame(next.gameNo, home, away, rng, isNeutralDay(kind) ? JC_PROFILE : JC_HOME_PROFILE), rng);
}

export interface NextConfGame { bracketId: string; gameId: string; gameNo: number; home: string; away: string; round: number }

/** The next conference tournament game: the first playable game of the lowest round that has one. */
export function nextConfGame(state: JcState): NextConfGame | string {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return problem;
  const ps = state.postseason;
  if (!ps) return 'Start the conference tournaments first';
  const open = ps.conf.flatMap(b => playableGames(b).map(g => ({ b, g })));
  if (!open.length) return 'The conference tournaments are over';
  const round = Math.min(...open.map(x => x.g.round));
  const first = open.find(x => x.g.round === round)!;
  return { bracketId: first.b.id, gameId: first.g.id, gameNo: ps.nextGameNo, home: first.g.home!, away: first.g.away!, round };
}

/** Records a watched conference tournament game (the next one); the round's ranking snapshot is added when the round is complete. */
export function recordConfGame(state: JcState, sim: SimGame, rng: Rng): JcResult {
  const next = nextConfGame(state);
  if (typeof next === 'string') return jcFail([next]);
  if (sim.gameNo !== next.gameNo || sim.home.teamId !== next.home || sim.away.teamId !== next.away) return jcFail(['That game is not the next one']);
  const ps = state.postseason!;
  const book = newBook(state);
  const result = applySim(book, sim, rng, leagueRefRating(state.rosters), true);
  let conf: JcPostseasonFile['conf'];
  try {
    conf = ps.conf.map(b => (b.id === next.bracketId ? recordResult(b, next.gameId, result) : b));
  } catch (e) {
    return jcFail([(e as Error).message]);
  }
  const postseason: JcPostseasonFile = { ...ps, conf, nextGameNo: next.gameNo + 1 };
  const changed: JcKey[] = ['postseason', 'rosters'];
  let rankings = state.rankings ?? { league: 'fbajc' as const, season: state.season, locked: false, snapshots: [] };
  const stillOpen = conf.flatMap(b => playableGames(b));
  if (!stillOpen.some(g => g.round === next.round)) {
    const games = [...(state.results?.games ?? []), ...postseasonGames(postseason)];
    const order = blendRankings({ teams: book.teamIds, ratings: book.ratings, games, totalGames: TOTAL_GAMES }, rng);
    rankings = { ...rankings, snapshots: [...rankings.snapshots, { afterDay: 29 + next.round, order }] };
    changed.push('rankings');
  }
  return {
    ok: true,
    state: { ...state, postseason, rankings, rosters: { ...state.rosters, teams: book.rosters } },
    changed,
    label: `${next.bracketId} tournament: ${next.away} ${result.awayPts}-${result.homePts} ${next.home}`,
  };
}
