import type { Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import { currentStepIndex, markStepDone } from '../shared/calendar';
import type { CalendarFile, CalendarStep, GameResult, PauseKind, ResultsFile, ScheduleFile, TeamsFile } from '../shared/types';
import { buildSchedule, defaultPauses, type SeasonLeague } from './schedule';
import { simGame, type SimGame, type SimTeam } from './sim';
import {
  CALENDAR_STEP, blockingPause, gamesPlayed, PAUSE_LABEL, schedulesStepId, seasonFail, type SeasonDocKey, type SeasonResult, type SeasonState,
} from './state';

export interface ScheduleLeagueInput { teams: TeamsFile; schedule: ScheduleFile | null; results: ResultsFile | null }
export interface MakeSchedulesInput { season: number; calendar: CalendarFile; fba: ScheduleLeagueInput; fbad2: ScheduleLeagueInput }
export type WritesResult = { ok: true; writes: { path: string; doc: unknown }[]; label: string } | { ok: false; problems: string[] };

/** The calendar's current step, or null once every step is done. */
function currentStep(cal: CalendarFile): CalendarStep | null {
  const i = currentStepIndex(cal);
  return i >= 0 ? cal.steps[i] : null;
}

/**
 * null when `wantId` is the calendar's current step (or, with `allowDone`, already done); otherwise the refusal message.
 * `allowDone` is for schedule-making, which stays open (as a re-roll) once its step is behind us.
 */
function calendarProblem(cal: CalendarFile, wantId: string, verb: string, allowDone = false): string | null {
  const cur = currentStep(cal);
  if (cur?.id === wantId) return null;
  const want = cal.steps.find(s => s.id === wantId);
  if (allowDone && want?.done) return null;
  return `${verb} at the ${want?.label ?? wantId} step (current step: ${cur ? cur.label : 'none'})`;
}

/** null unless the make-schedules step for this season is past due (neither current nor done). For gating the Make/Re-roll button. */
export function scheduleStepProblem(cal: CalendarFile, season: number): string | null {
  return calendarProblem(cal, schedulesStepId(season), 'Schedules are made', true);
}

/** null unless this league's calendar step isn't current. For gating sim/record actions and their buttons. */
export function leagueStepProblem(cal: CalendarFile, league: SeasonLeague): string | null {
  return calendarProblem(cal, CALENDAR_STEP[league], 'The season is played');
}

export function makeSchedules(input: MakeSchedulesInput, rng: Rng): WritesResult {
  const stepProblem = scheduleStepProblem(input.calendar, input.season);
  if (stepProblem) return { ok: false, problems: [stepProblem] };
  const played = (input.fba.results?.games.length ?? 0) + (input.fbad2.results?.games.length ?? 0);
  if (played > 0) return { ok: false, problems: ["Games have been played; the schedules can't be re-rolled"] };
  const writes: { path: string; doc: unknown }[] = [];
  for (const league of ['fba', 'fbad2'] as SeasonLeague[]) {
    const teams = input[league].teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
    const games = buildSchedule(league, teams, rng);
    writes.push({ path: `leagues/${league}/S${input.season}/schedule.json`, doc: { league, season: input.season, locked: false, games, pauses: defaultPauses(league, games.length) } });
    writes.push({ path: `leagues/${league}/S${input.season}/results.json`, doc: { league, season: input.season, locked: false, games: [] } });
  }
  writes.push({ path: 'calendar.json', doc: markStepDone(input.calendar, schedulesStepId(input.season)) });
  return { ok: true, writes, label: input.fba.schedule || input.fbad2.schedule ? 'Re-roll schedules' : 'Make schedules' };
}

/** The team's five, in position order, or why it can't play. */
export function lineup(state: SeasonState, teamId: string): SimTeam | string {
  const entries = state.rosters.teams[teamId];
  if (!entries) return `${teamId} has no roster`;
  const players = [];
  for (const pos of POSITIONS) {
    const e = entries.find(x => x.position === pos && x.playerId !== null);
    if (!e || e.rating === null) return `${teamId} has no rated ${pos}`;
    players.push({ playerId: e.playerId!, position: pos, rating: e.rating });
  }
  return { teamId, players };
}

/** Sims up to `max` upcoming games in schedule order, stopping at a pause or the end of the regular season. Nothing is saved. */
export function simNextGames(state: SeasonState, max: number, rng: Rng): { games: SimGame[]; problem: string | null } {
  const stepProblem = leagueStepProblem(state.calendar, state.league);
  if (stepProblem) return { games: [], problem: stepProblem };
  const sched = state.schedule;
  if (!sched || !state.results) return { games: [], problem: 'Make schedules first' };
  const out: SimGame[] = [];
  let played = gamesPlayed(state);
  while (out.length < max && played < sched.games.length) {
    if (sched.pauses.some(p => !p.done && p.afterGame <= played)) break;
    const g = sched.games[played];
    const home = lineup(state, g.home);
    if (typeof home === 'string') return { games: out, problem: home };
    const away = lineup(state, g.away);
    if (typeof away === 'string') return { games: out, problem: away };
    out.push(simGame(g.gameNo, home, away, rng));
    played++;
  }
  return { games: out, problem: null };
}

export function toGameResult(g: SimGame): GameResult {
  return {
    gameNo: g.gameNo,
    home: g.home.teamId,
    away: g.away.teamId,
    homePts: g.homePts,
    awayPts: g.awayPts,
    ot: g.ot,
    periods: g.periods,
    box: {
      home: g.home.players.map((p, k) => ({ playerId: p.playerId, pts: g.box.home[k] })),
      away: g.away.players.map((p, k) => ({ playerId: p.playerId, pts: g.box.away[k] })),
    },
  };
}

/** Saves simmed games (which must be the next ones, in order, not past an unfinished pause). */
export function recordGames(state: SeasonState, games: SimGame[]): SeasonResult {
  const stepProblem = leagueStepProblem(state.calendar, state.league);
  if (stepProblem) return seasonFail([stepProblem]);
  const sched = state.schedule;
  if (!sched || !state.results) return seasonFail(['Make schedules first']);
  if (!games.length) return seasonFail(['No games to record']);
  const played = gamesPlayed(state);
  const problems: string[] = [];
  games.forEach((g, k) => {
    const want = sched.games[played + k];
    if (!want || g.gameNo !== want.gameNo) problems.push(`Game ${g.gameNo} isn't next (expected game ${played + k + 1})`);
    else if (g.home.teamId !== want.home || g.away.teamId !== want.away) problems.push(`Game ${g.gameNo} is ${want.away} @ ${want.home}`);
  });
  const last = played + games.length;
  const pause = sched.pauses.find(p => !p.done && p.afterGame < last);
  if (pause) problems.push(`Finish the ${PAUSE_LABEL[pause.kind]} pause (after game ${pause.afterGame}) first`);
  if (problems.length) return seasonFail(problems);

  const results = games.map(toGameResult);
  const add = new Map<string, number>();
  for (const r of results) for (const line of [...r.box!.home, ...r.box!.away]) add.set(line.playerId, (add.get(line.playerId) ?? 0) + line.pts);
  const teams = Object.fromEntries(Object.entries(state.rosters.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId && add.has(e.playerId) ? { ...e, points: e.points + add.get(e.playerId)! } : e)),
  ]));
  const done = last === sched.games.length;
  const changed: SeasonDocKey[] = done ? ['results', 'rosters', 'calendar'] : ['results', 'rosters'];
  const one = results[0];
  const label = results.length === 1
    ? `Game ${one.gameNo}: ${one.away} ${one.awayPts} @ ${one.home} ${one.homePts}`
    : `Games ${results[0].gameNo}–${results[results.length - 1].gameNo}`;
  return {
    ok: true,
    state: {
      ...state,
      results: { ...state.results, games: [...state.results.games, ...results] },
      rosters: { ...state.rosters, teams },
      calendar: done ? markStepDone(state.calendar, CALENDAR_STEP[state.league]) : state.calendar,
    },
    changed,
    label,
  };
}

/** Marks the first unfinished pause done, if it is of this kind. */
export function completePause(schedule: ScheduleFile, kind: PauseKind): ScheduleFile | null {
  const i = schedule.pauses.findIndex(p => !p.done);
  if (i < 0 || schedule.pauses[i].kind !== kind) return null;
  return { ...schedule, pauses: schedule.pauses.map((p, j) => (j === i ? { ...p, done: true } : p)) };
}

export function closeTradeDeadline(state: SeasonState): SeasonResult {
  const p = blockingPause(state);
  if (!p || p.kind !== 'deadline' || !state.schedule) return seasonFail(['The trade deadline is not up yet']);
  const schedule = completePause(state.schedule, 'deadline')!;
  return { ok: true, state: { ...state, schedule }, changed: ['schedule'], label: 'Close trading (trade deadline)' };
}
