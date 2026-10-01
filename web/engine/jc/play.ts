import { randInt, type Rng } from '../d2/random';
import { calendarProblem, toGameResult } from '../season/moves';
import { JC_PROFILE, simGame, type SimTeam } from '../season/sim';
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

function lineupOf(roster: RosterEntry[] | undefined, teamId: string): SimTeam | string {
  if (!roster) return `${teamId} has no roster`;
  const players = [];
  for (const pos of POSITIONS) {
    const e = roster.find(x => x.position === pos && x.playerId !== null);
    if (!e || e.rating === null) return `${teamId} has no rated ${pos}`;
    players.push({ playerId: e.playerId!, position: pos, rating: e.rating });
  }
  return { teamId, players };
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

  const rosters: Record<string, RosterEntry[]> = { ...state.rosters.teams };
  const ratings: Record<string, number> = {};
  let total = 0;
  const teamIds = state.teams.teams.map(t => t.teamId);
  for (const id of teamIds) {
    ratings[id] = teamRating(rosters[id] ?? []);
    total += ratings[id];
  }
  const setRoster = (id: string, r: RosterEntry[]): void => {
    rosters[id] = r;
    const nr = teamRating(r);
    total += nr - ratings[id];
    ratings[id] = nr;
  };
  const results: GameResult[] = [];
  for (const g of games) {
    const home = lineupOf(rosters[g.home], g.home);
    const away = lineupOf(rosters[g.away], g.away);
    if (typeof home === 'string') return { problems: [home] };
    if (typeof away === 'string') return { problems: [away] };
    const sim = simGame(g.gameNo, home, away, rng, JC_PROFILE);
    results.push(toGameResult(sim));
    const pts: Record<string, number> = {};
    for (const side of ['home', 'away'] as const) sim[side].players.forEach((p, k) => { pts[p.playerId] = sim.box[side][k]; });
    for (const id of [g.home, g.away]) {
      setRoster(id, rosters[id].map(e => (e.playerId !== null && pts[e.playerId] !== undefined ? { ...e, points: e.points + pts[e.playerId] } : e)));
    }
    const homeWon = sim.homePts > sim.awayPts;
    setRoster(g.home, progressRatings(rosters[g.home], pts, homeWon, ratings[g.away], total / teamIds.length, rng));
    setRoster(g.away, progressRatings(rosters[g.away], pts, !homeWon, ratings[g.home], total / teamIds.length, rng));
  }

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
