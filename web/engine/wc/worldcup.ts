import { shuffle, type Rng } from '../d2/random';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, GameResult, KnockoutGame, KnockoutRound, QualifyingFile, RostersFile, ScheduleGame, WorldCupFile } from '../shared/types';
import { calendarProblem, toGameResult } from '../season/moves';
import { simGame } from '../season/sim';
import { countryRating } from './rating';
import { deriveRosters } from './roster';
import { simTeam, wcFail, winnerOf, worldCupStepId, type WcResult } from './state';
import { rankTable, type WcTable } from './tiebreak';

export interface WorldCupState { calendar: CalendarFile; rosters: RostersFile; worldCup: WorldCupFile | null }

const GROUP_IDS = 'ABCDEFGHIJKLMNOP'.split('');

/** Three round-robin rounds for four teams, then the same three with home and away swapped. */
function doubleRoundRobin(t: string[]): [string, string][][] {
  const single: [string, string][][] = [
    [[t[0], t[3]], [t[1], t[2]]],
    [[t[0], t[2]], [t[3], t[1]]],
    [[t[0], t[1]], [t[2], t[3]]],
  ];
  return [...single, ...single.map(r => r.map(([h, a]): [string, string] => [a, h]))];
}

export function startWorldCup(
  input: { season: number; calendar: CalendarFile; d2Rosters: RostersFile; countries: string[]; qualifying: QualifyingFile; previous: RostersFile; existing?: WorldCupFile | null },
  rng: Rng,
): WcResult<WorldCupState> {
  const problem = calendarProblem(input.calendar, worldCupStepId(input.season), 'The World Cup is started');
  if (problem) return wcFail([problem]);
  if (input.existing) return wcFail(['The World Cup has already been started']);
  const q = input.qualifying;
  if (q.season !== input.season - 1) return wcFail([`Qualifying is from S${q.season}, expected S${input.season - 1}`]);
  if (input.previous.season !== input.season - 1) return wcFail([`Previous rosters are from S${input.previous.season}, expected S${input.season - 1}`]);
  if (q.advanced.length !== 49) return wcFail([`Qualifying must be finished first (${q.advanced.length} of 49 teams advanced)`]);
  const field = [...q.auto, ...q.advanced];
  if (new Set(field).size !== 64) return wcFail(['The World Cup field must be 64 distinct teams']);
  if (!field.includes(q.host)) return wcFail([`Host ${q.host} is not in the World Cup field`]);
  const teams = deriveRosters({ countries: input.countries, d2Rosters: input.d2Rosters, mode: 'worldcup', previous: input.previous }, rng);
  const rating = (id: string) => countryRating(teams[id]);
  const keys: Record<string, number> = {};
  for (const id of [...field].sort()) keys[id] = rng();
  const sorted = [...field].sort((a, b) => rating(b) - rating(a) || keys[a] - keys[b]);
  const pots = [0, 1, 2, 3].map(p => sorted.slice(p * 16, p * 16 + 16));
  const groups: Record<string, string[]> = Object.fromEntries(GROUP_IDS.map(g => [g, [] as string[]]));
  for (const pot of pots) {
    const order = shuffle(pot, rng);
    const h = order.indexOf(q.host);
    if (h > 0) [order[0], order[h]] = [order[h], order[0]];
    order.forEach((id, k) => groups[GROUP_IDS[k]].push(id));
  }
  const perGroup = GROUP_IDS.map(g => doubleRoundRobin(groups[g]));
  const schedule: ScheduleGame[] = [];
  for (let round = 0; round < 6; round++) {
    for (const rounds of perGroup) {
      for (const [home, away] of rounds[round]) schedule.push({ gameNo: schedule.length + 1, home, away });
    }
  }
  const worldCup: WorldCupFile = {
    league: 'fbawc', season: input.season, host: q.host, field, pots, groups, keys, schedule,
    groupGames: [], knockout: [], champion: null, runnerUp: null,
  };
  const rosters: RostersFile = { league: 'fbawc', season: input.season, locked: true, teams };
  return {
    ok: true,
    state: { calendar: input.calendar, rosters, worldCup },
    changed: ['fbawc/rosters', 'fbawc/worldcup'],
    label: `World Cup drawn: ${field.length} teams in ${GROUP_IDS.length} groups, ${schedule.length} games`,
  };
}

function simNext(state: WorldCupState, gameNo: number, homeId: string, awayId: string, rng: Rng): GameResult | string {
  const home = state.rosters.teams[homeId];
  const away = state.rosters.teams[awayId];
  if (!home || !away) return `${homeId} or ${awayId} has no roster`;
  return toGameResult(simGame(gameNo, simTeam(homeId, home), simTeam(awayId, away), rng));
}

export function playGroupGame(state: WorldCupState, rng: Rng): WcResult<WorldCupState> {
  const wc = state.worldCup;
  if (!wc) return wcFail(['The World Cup has not been started']);
  const problem = calendarProblem(state.calendar, worldCupStepId(wc.season), 'World Cup games are played');
  if (problem) return wcFail([problem]);
  const next = wc.schedule[wc.groupGames.length];
  if (!next) return wcFail(['Every group game has been played']);
  const game = simNext(state, next.gameNo, next.home, next.away, rng);
  if (typeof game === 'string') return wcFail([game]);
  return {
    ok: true,
    state: { ...state, worldCup: { ...wc, groupGames: [...wc.groupGames, game] } },
    changed: ['fbawc/worldcup'],
    label: `Group game ${next.gameNo}: ${next.home} ${game.homePts}-${game.awayPts} ${next.away}`,
  };
}

export function groupTable(wc: WorldCupFile, group: string): WcTable {
  return rankTable(wc.groups[group], wc.groupGames, wc.keys);
}

const R32_PAIRS: [string, number, string, number][] = [
  ['A', 0, 'B', 1], ['C', 0, 'D', 1], ['E', 0, 'F', 1], ['G', 0, 'H', 1],
  ['I', 0, 'J', 1], ['K', 0, 'L', 1], ['M', 0, 'N', 1], ['O', 0, 'P', 1],
  ['B', 0, 'A', 1], ['D', 0, 'C', 1], ['F', 0, 'E', 1], ['H', 0, 'G', 1],
  ['J', 0, 'I', 1], ['L', 0, 'K', 1], ['N', 0, 'M', 1], ['P', 0, 'O', 1],
];

const ROUNDS: [KnockoutRound, number][] = [['R32', 16], ['R16', 8], ['QF', 4], ['SF', 2], ['F', 1]];

export function finishGroups(state: WorldCupState): WcResult<WorldCupState> {
  const wc = state.worldCup;
  if (!wc) return wcFail(['The World Cup has not been started']);
  if (wc.knockout.length > 0) return wcFail(['The group stage is already finished']);
  const problem = calendarProblem(state.calendar, worldCupStepId(wc.season), 'The group stage is finished');
  if (problem) return wcFail([problem]);
  if (wc.groupGames.length < wc.schedule.length) return wcFail([`${wc.schedule.length - wc.groupGames.length} group games are still unplayed`]);
  const place = (g: string, k: number) => groupTable(wc, g).rows[k].teamId;
  const knockout: KnockoutGame[] = [];
  R32_PAIRS.forEach(([g1, k1, g2, k2], i) => {
    knockout.push({ id: `R32-${i + 1}`, round: 'R32', home: place(g1, k1), away: place(g2, k2), game: null });
  });
  for (const [round, n] of ROUNDS.slice(1)) {
    for (let i = 1; i <= n; i++) knockout.push({ id: `${round}-${i}`, round, home: null, away: null, game: null });
  }
  return {
    ok: true,
    state: { ...state, worldCup: { ...wc, knockout } },
    changed: ['fbawc/worldcup'],
    label: `Group stage finished: ${knockout.filter(g => g.round === 'R32').length} round of 32 games set`,
  };
}

export function playKnockoutGame(state: WorldCupState, rng: Rng): WcResult<WorldCupState> {
  const wc = state.worldCup;
  if (!wc) return wcFail(['The World Cup has not been started']);
  const problem = calendarProblem(state.calendar, worldCupStepId(wc.season), 'World Cup games are played');
  if (problem) return wcFail([problem]);
  const idx = wc.knockout.findIndex(g => g.home !== null && g.away !== null && g.game === null);
  if (idx < 0) return wcFail(['No knockout game is ready to play']);
  const slot = wc.knockout[idx];
  const gameNo = wc.groupGames.length + wc.knockout.filter(g => g.game !== null).length + 1;
  const game = simNext(state, gameNo, slot.home!, slot.away!, rng);
  if (typeof game === 'string') return wcFail([game]);
  const winner = winnerOf(game);
  const loser = winner === game.home ? game.away : game.home;
  const knockout = wc.knockout.map(g => ({ ...g }));
  knockout[idx].game = game;
  let champion = wc.champion;
  let runnerUp = wc.runnerUp;
  if (slot.round === 'F') {
    champion = winner;
    runnerUp = loser;
  } else {
    const [round, n] = slot.id.split('-');
    const next = ROUNDS[ROUNDS.findIndex(r => r[0] === round) + 1][0];
    const nextSlot = knockout.find(g => g.id === `${next}-${Math.ceil(Number(n) / 2)}`)!;
    if (Number(n) % 2 === 1) nextSlot.home = winner; else nextSlot.away = winner;
  }
  return {
    ok: true,
    state: { ...state, worldCup: { ...wc, knockout, champion, runnerUp } },
    changed: ['fbawc/worldcup'],
    label: `${slot.id}: ${game.home} ${game.homePts}-${game.awayPts} ${game.away}`,
  };
}

export function finishWorldCup(state: WorldCupState): WcResult<WorldCupState> {
  const wc = state.worldCup;
  if (!wc) return wcFail(['The World Cup has not been started']);
  if (!wc.champion) return wcFail(['The World Cup has no champion yet']);
  const problem = calendarProblem(state.calendar, worldCupStepId(wc.season), 'The World Cup is finished');
  if (problem) return wcFail([problem]);
  return {
    ok: true,
    state: { ...state, calendar: markStepDone(state.calendar, worldCupStepId(wc.season)) },
    changed: ['calendar'],
    label: `World Cup finished: ${wc.champion}`,
  };
}
