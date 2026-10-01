import { randInt, type Rng } from '../d2/random';
import { leagueRefRating } from '../awards/defense';
import { calendarProblem, toGameResult } from '../season/moves';
import { JC_PROFILE, simGame, type SimGame, type SimTeam } from '../season/sim';
import { POSITIONS } from '../roster/rules';
import type { GameResult, JcScheduleFile, RosterEntry } from '../shared/types';
import { blendRankings, teamRating } from './rankings';
import { DAYS, TEAMS_PER_DAY, dayPlayed, jcFail, type JcKey, type JcResult, type JcState } from './state';
import { dayGames } from './tournaments';

const TOTAL_GAMES = DAYS * TEAMS_PER_DAY;

export const regularSeasonOver = (state: JcState): boolean => dayPlayed(state) >= DAYS;

/** Port of `updatePlayerRatings` (Main.java:1639), integer arithmetic as the Java. */
export function progressRatings(
  roster: RosterEntry[], lastPoints: Record<string, number>, won: boolean, oppRating: number, avgRating: number, rng: Rng,
): RosterEntry[] {
  return roster.map(e => {
    if (e.rating === null || e.playerId === null) return e;
    const rat = e.rating;
    const mrp = lastPoints[e.playerId] ?? 0;
    let random = randInt(rng, 0, 99);
    let chance = Math.trunc(((99 - rat + Math.trunc(mrp / 2)) * 2) / 3);
    if (rat >= 90) chance = Math.trunc((chance * 5) / 9);
    else if (rat >= 82) chance = Math.trunc((chance * 5) / 8);
    else if (rat >= 72) chance = Math.trunc((chance * 5) / 7);
    else if (rat >= 65) chance = Math.trunc((chance * 5) / 6);
    const mult = Math.max(0.8, Math.min(1.2, 1 + 0.02 * (oppRating - avgRating)));
    chance = Math.floor(chance * mult + 0.5);
    if (!won) chance = Math.trunc(chance / 2);
    let upgrade = 0;
    while (chance > random) {
      upgrade++;
      chance = Math.trunc(chance / 2);
      random = randInt(rng, 0, 99);
    }
    const next = Math.min(99, rat + upgrade);
    return next === rat ? e : { ...e, rating: next };
  });
}

export function lineupOf(roster: RosterEntry[] | undefined, teamId: string): SimTeam | string {
  if (!roster) return `${teamId} has no roster`;
  const players = [];
  for (const pos of POSITIONS) {
    const e = roster.find(x => x.position === pos && x.playerId !== null);
    if (!e || e.rating === null) return `${teamId} has no rated ${pos}`;
    players.push({ playerId: e.playerId!, position: pos, rating: e.rating });
  }
  return { teamId, players };
}


/** Rosters and team ratings kept in step while games are simmed in memory. */
export interface Book {
  rosters: Record<string, RosterEntry[]>;
  ratings: Record<string, number>;
  total: number;
  teamIds: string[];
}

export function newBook(state: JcState): Book {
  const rosters: Record<string, RosterEntry[]> = { ...state.rosters.teams };
  const ratings: Record<string, number> = {};
  let total = 0;
  const teamIds = state.teams.teams.map(t => t.teamId);
  for (const id of teamIds) {
    ratings[id] = teamRating(rosters[id] ?? []);
    total += ratings[id];
  }
  return { rosters, ratings, total, teamIds };
}


function setBookRoster(book: Book, id: string, r: RosterEntry[]): void {
  book.rosters[id] = r;
  const nr = teamRating(r);
  book.total += nr - book.ratings[id];
  book.ratings[id] = nr;
}

/** Adds one game's box points to both teams' roster entries on the book and returns points by player id. */
export function addBoxPoints(book: Book, sim: SimGame): Record<string, number> {
  const pts: Record<string, number> = {};
  for (const side of ['home', 'away'] as const) sim[side].players.forEach((p, k) => { pts[p.playerId] = sim.box[side][k]; });
  for (const id of [sim.home.teamId, sim.away.teamId]) {
    setBookRoster(book, id, book.rosters[id].map(e => (e.playerId !== null && pts[e.playerId] !== undefined ? { ...e, points: e.points + pts[e.playerId] } : e)));
  }
  return pts;
}

/**
 * Sims one game on the book: adds the box points to both rosters and, when `progress` is set, lets every starter's rating rise
 * (team ratings and the league average are recomputed after each game, as the Java does). Returns the result, or a problem.
 */
export function playOne(book: Book, gameNo: number, homeId: string, awayId: string, rng: Rng, refRating: number, progress: boolean): GameResult | string {
  const home = lineupOf(book.rosters[homeId], homeId);
  const away = lineupOf(book.rosters[awayId], awayId);
  if (typeof home === 'string') return home;
  if (typeof away === 'string') return away;
  return applySim(book, simGame(gameNo, home, away, rng, JC_PROFILE), rng, refRating, progress);
}

/** Applies an already simmed (or watched) game to the book, as `playOne` does after the sim. */
export function applySim(book: Book, sim: SimGame, rng: Rng, refRating: number, progress: boolean): GameResult {
  const homeId = sim.home.teamId;
  const awayId = sim.away.teamId;
  const pts = addBoxPoints(book, sim);
  if (progress) {
    const homeWon = sim.homePts > sim.awayPts;
    const avg = book.total / book.teamIds.length;
    setBookRoster(book, homeId, progressRatings(book.rosters[homeId], pts, homeWon, book.ratings[awayId], avg, rng));
    setBookRoster(book, awayId, progressRatings(book.rosters[awayId], pts, !homeWon, book.ratings[homeId], avg, rng));
  }
  return toGameResult(sim, refRating);
}

type Step = { state: JcState; filledSchedule: boolean } | { problems: string[] };

function step(state: JcState, rng: Rng): Step {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return { problems: [problem] };
  if (!state.schedule) return { problems: ['Make the schedule first'] };
  if (regularSeasonOver(state)) return { problems: ['The regular season is over'] };
  const day = dayPlayed(state) + 1;
  let schedule: JcScheduleFile = state.schedule;
  let filledSchedule = false;
  const sched = schedule.days.find(d => d.day === day);
  if (!sched) return { problems: [`Day ${day} is not in the schedule`] };
  let games = sched.games;
  if (games.length === 0 && (day === 2 || day === 3)) {
    try {
      const built = dayGames(day, schedule.tournaments, state.results?.games ?? [], (day - 1) * TEAMS_PER_DAY + 1, rng);
      games = built.map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, tournament: g.tournament }));
    } catch (e) {
      return { problems: [(e as Error).message] };
    }
    const filled = games;
    schedule = { ...schedule, days: schedule.days.map(d => (d.day === day ? { ...d, games: filled } : d)) };
    filledSchedule = true;
  }
  if (games.length !== TEAMS_PER_DAY) return { problems: [`Day ${day} has ${games.length} games, expected ${TEAMS_PER_DAY}`] };
  const busy = new Set<string>();
  for (const g of games) {
    for (const t of [g.home, g.away]) {
      if (busy.has(t)) return { problems: [`${t} plays twice on day ${day}`] };
      busy.add(t);
    }
  }

  const book = newBook(state);
  const refRating = leagueRefRating(state.rosters);
  const results: GameResult[] = [];
  const done = new Set((state.results?.games ?? []).map(g => g.gameNo));
  for (const g of games.filter(x => !done.has(x.gameNo))) {
    const r = playOne(book, g.gameNo, g.home, g.away, rng, refRating, true);
    if (typeof r === 'string') return { problems: [r] };
    results.push(r);
  }
  const { rosters, ratings } = book;
  const teamIds = book.teamIds;

  const allGames = [...(state.results?.games ?? []), ...results];
  const order = blendRankings({ teams: teamIds, ratings, games: allGames, totalGames: TOTAL_GAMES }, rng);
  const rankings = state.rankings ?? { league: 'fbajc' as const, season: state.season, locked: false, snapshots: [] };
  const next: JcState = {
    ...state,
    schedule,
    rosters: { ...state.rosters, teams: rosters },
    results: { league: 'fbajc', season: state.season, locked: state.results?.locked ?? false, games: allGames },
    rankings: { ...rankings, snapshots: [...rankings.snapshots, { afterDay: day, order }] },
  };
  return { state: next, filledSchedule };
}

const changedKeys = (filled: boolean): JcKey[] => [...(filled ? (['schedule'] as JcKey[]) : []), 'results', 'rosters', 'rankings'];

/** Plays the next unplayed day (108 games) in memory. */
export function playDay(state: JcState, rng: Rng): JcResult {
  const r = step(state, rng);
  if ('problems' in r) return jcFail(r.problems);
  return { ok: true, state: r.state, changed: changedKeys(r.filledSchedule), label: `Play day ${dayPlayed(r.state)}` };
}

/** Plays every remaining day in memory; one result. */
export function playToEnd(state: JcState, rng: Rng): JcResult {
  let cur = state;
  let filled = false;
  do {
    const r = step(cur, rng);
    if ('problems' in r) return jcFail(r.problems);
    cur = r.state;
    filled ||= r.filledSchedule;
  } while (!regularSeasonOver(cur));
  return { ok: true, state: cur, changed: changedKeys(filled), label: 'Play to end of regular season' };
}
