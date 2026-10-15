import { randInt, type Rng } from '../d2/random';
import { leagueRefRating } from '../awards/defense';
import { calendarProblem, toGameResult } from '../season/moves';
import { JC_HOME_PROFILE, JC_PROFILE, simGame, type SimGame, type SimTeam } from '../season/sim';
import { POSITIONS } from '../roster/rules';
import type { GameResult, JcScheduleFile, RosterEntry } from '../shared/types';
import { blendRankings, teamRating } from './rankings';
import { DAYS, TEAMS_PER_DAY, TOTAL_GAMES, dayPlayed, jcFail, type JcKey, type JcResult, type JcState } from './state';
import { dayGames } from './tournaments';


/**
 * Only the regular season's conference and challenge days have a real home side. Preseason tournaments (and the postseason, which has no
 * schedule day) are on a neutral court: the first-listed team gets no home-court edge.
 */
export const isNeutralDay = (kind: 'tournament' | 'challenge' | 'conference' | undefined): boolean => kind !== 'conference' && kind !== 'challenge';

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
export function playOne(book: Book, gameNo: number, homeId: string, awayId: string, rng: Rng, refRating: number, progress: boolean, neutral = true): GameResult | string {
  const home = lineupOf(book.rosters[homeId], homeId);
  const away = lineupOf(book.rosters[awayId], awayId);
  if (typeof home === 'string') return home;
  if (typeof away === 'string') return away;
  return applySim(book, simGame(gameNo, home, away, rng, neutral ? JC_PROFILE : JC_HOME_PROFILE), rng, refRating, progress);
}

/** Applies an already simmed (or watched) game to the book, as `playOne` does after the sim. */
export function applySim(book: Book, sim: SimGame, rng: Rng, refRating: number, progress: boolean): GameResult {
  const homeId = sim.home.teamId;
  const awayId = sim.away.teamId;
  const pts = addBoxPoints(book, sim);
  const ratingChanges: NonNullable<GameResult['ratingChanges']> = [];
  if (progress) {
    const homeWon = sim.homePts > sim.awayPts;
    const avg = book.total / book.teamIds.length;
    const before = { [homeId]: book.rosters[homeId], [awayId]: book.rosters[awayId] };
    setBookRoster(book, homeId, progressRatings(book.rosters[homeId], pts, homeWon, book.ratings[awayId], avg, rng));
    setBookRoster(book, awayId, progressRatings(book.rosters[awayId], pts, !homeWon, book.ratings[homeId], avg, rng));
    for (const id of [homeId, awayId]) {
      before[id].forEach((e, k) => {
        const now = book.rosters[id][k];
        if (e.playerId !== null && e.rating !== null && now.rating !== null && now.rating !== e.rating) {
          ratingChanges.push({ playerId: e.playerId, teamId: id, from: e.rating, to: now.rating });
        }
      });
    }
  }
  return { ...toGameResult(sim, refRating), ...(ratingChanges.length ? { ratingChanges } : {}) };
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
    const r = playOne(book, g.gameNo, g.home, g.away, rng, refRating, true, isNeutralDay(sched.kind));
    if (typeof r === 'string') return { problems: [r] };
    results.push(r);
  }
  const { rosters, ratings } = book;
  const teamIds = book.teamIds;

  const allGames = [...(state.results?.games ?? []), ...results];
  const order = blendRankings({ teams: teamIds, ratings, games: allGames, totalGames: TOTAL_GAMES }, rng);
  const rankings = state.rankings ?? { league: 'fbajc' as const, season: state.season, locked: false, snapshots: [] };
  // Tournament days 2 and 3 are drawn from the day before, so draw the next one as soon as this day is finished.
  const after = day + 1;
  const afterDay = schedule.days.find(d => d.day === after);
  if (afterDay && afterDay.games.length === 0 && (after === 2 || after === 3)) {
    try {
      const built = dayGames(after, schedule.tournaments, allGames, (after - 1) * TEAMS_PER_DAY + 1, rng)
        .map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, tournament: g.tournament }));
      schedule = { ...schedule, days: schedule.days.map(d => (d.day === after ? { ...d, games: built } : d)) };
      filledSchedule = true;
    } catch (e) {
      return { problems: [(e as Error).message] };
    }
  }
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

/** The conference codes that have a team in the league, in the teams file's order. */
export function conferencesOf(state: JcState): string[] {
  const out: string[] = [];
  for (const t of state.teams.teams) if (t.group && !out.includes(t.group)) out.push(t.group);
  return out;
}

/**
 * Plays the games one conference has left on the open day (the first day not finished), in memory; one result. Other conferences'
 * games are left alone, so the day is finished (and gets its ranking snapshot) once every conference has played it.
 */
export function playConference(state: JcState, conference: string, rng: Rng): JcResult {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return jcFail([problem]);
  if (!state.schedule) return jcFail(['Make the schedule first']);
  if (regularSeasonOver(state)) return jcFail(['The regular season is over']);
  const members = new Set(state.teams.teams.filter(t => t.group === conference).map(t => t.teamId));
  if (members.size === 0) return jcFail([`There is no conference ${conference}`]);
  const done = new Set((state.results?.games ?? []).map(g => g.gameNo));
  const days = [...state.schedule.days].sort((a, b) => a.day - b.day);
  const open = days.find(d => d.day === dayPlayed(state) + 1);
  if (!open || open.kind !== 'conference') return jcFail(['Conference play has not started: the open day is not a conference day']);
  const todo = open.games.filter(g => !done.has(g.gameNo) && members.has(g.home) && members.has(g.away));
  if (todo.length === 0) return jcFail([`${conference} has no games left on day ${open.day}`]);

  const book = newBook(state);
  const refRating = leagueRefRating(state.rosters);
  const results: GameResult[] = [];
  for (const g of todo) {
    const r = playOne(book, g.gameNo, g.home, g.away, rng, refRating, true, false);
    if (typeof r === 'string') return jcFail([r]);
    results.push(r);
  }
  const allGames = [...(state.results?.games ?? []), ...results].sort((a, b) => a.gameNo - b.gameNo);
  const have = new Set(allGames.map(g => g.gameNo));
  const dayOf = new Map<number, number>();
  for (const d of days) for (const g of d.games) dayOf.set(g.gameNo, d.day);
  // A day this finished gets the ranking snapshot a played day always has.
  const rankings = state.rankings ?? { league: 'fbajc' as const, season: state.season, locked: false, snapshots: [] };
  const snapshots = [...rankings.snapshots];
  for (const d of days) {
    if (d.games.length === 0 || !d.games.every(g => have.has(g.gameNo)) || snapshots.some(s => s.afterDay === d.day)) continue;
    const upTo = allGames.filter(g => (dayOf.get(g.gameNo) ?? 0) <= d.day);
    snapshots.push({ afterDay: d.day, order: blendRankings({ teams: book.teamIds, ratings: book.ratings, games: upTo, totalGames: TOTAL_GAMES }, rng) });
  }
  snapshots.sort((a, b) => a.afterDay - b.afterDay);
  const next: JcState = {
    ...state,
    rosters: { ...state.rosters, teams: book.rosters },
    results: { league: 'fbajc', season: state.season, locked: state.results?.locked ?? false, games: allGames },
    rankings: { ...rankings, snapshots },
  };
  return { ok: true, state: next, changed: ['results', 'rosters', 'rankings'], label: `Sim rest of ${conference} on day ${open.day}: ${results.length} games` };
}
