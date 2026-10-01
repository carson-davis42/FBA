import { randInt, shuffle, type Rng } from '../d2/random';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, QualifyingFile, RostersFile, ScheduleGame } from '../shared/types';
import { calendarProblem, toGameResult } from '../season/moves';
import { simGame } from '../season/sim';
import { countryRating } from './rating';
import { deriveRosters } from './roster';
import { qualifyingStepId, simTeam, wcFail, type WcResult } from './state';
import { rankTable, type WcTable } from './tiebreak';

export interface QualifyingState { calendar: CalendarFile; rosters: RostersFile; qualifying: QualifyingFile | null }

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** A random 6-regular graph on `ids` as distinct pairs (n = 70 gives 210). */
export function sixRegularPairs(ids: string[], rng: Rng): [string, string][] {
  if (ids.length < 7) throw new RangeError('A 6-regular graph needs at least 7 teams');
  const order = shuffle(ids, rng);
  const n = order.length;
  const edges: [string, string][] = [];
  const has = new Set<string>();
  for (let i = 0; i < n; i++) {
    for (const d of [1, 2, 3]) {
      const a = order[i];
      const b = order[(i + d) % n];
      edges.push([a, b]);
      has.add(pairKey(a, b));
    }
  }
  for (let s = 0; s < 200; s++) {
    const i = randInt(rng, 0, edges.length - 1);
    const j = randInt(rng, 0, edges.length - 1);
    if (i === j) continue;
    const [a, b] = edges[i];
    const [c, d] = edges[j];
    if (new Set([a, b, c, d]).size < 4) continue;
    if (has.has(pairKey(a, d)) || has.has(pairKey(c, b))) continue;
    has.delete(pairKey(a, b)); has.delete(pairKey(c, d));
    has.add(pairKey(a, d)); has.add(pairKey(c, b));
    edges[i] = [a, d];
    edges[j] = [c, b];
  }
  return edges;
}

/** Arranges pairs into rounds greedily (no team twice in a round), ordered by round. */
function inRounds(pairs: [string, string][]): [string, string][] {
  const rounds: { used: Set<string>; games: [string, string][] }[] = [];
  for (const p of pairs) {
    let r = rounds.find(x => !x.used.has(p[0]) && !x.used.has(p[1]));
    if (!r) { r = { used: new Set(), games: [] }; rounds.push(r); }
    r.used.add(p[0]); r.used.add(p[1]);
    r.games.push(p);
  }
  return rounds.flatMap(r => r.games);
}

export function startQualifying(
  input: { season: number; calendar: CalendarFile; d2Rosters: RostersFile; countries: string[]; host: string; previousWc: RostersFile | null; existing?: QualifyingFile | null },
  rng: Rng,
): WcResult<QualifyingState> {
  const problem = calendarProblem(input.calendar, qualifyingStepId(input.season), 'Qualifying is started');
  if (problem) return wcFail([problem]);
  if (input.existing) return wcFail(['Qualifying has already been started']);
  if (input.countries.length !== 85) return wcFail([`Qualifying needs 85 countries, got ${input.countries.length}`]);
  if (!input.countries.includes(input.host)) return wcFail([`Host ${input.host} is not a country`]);
  const teams = deriveRosters({ countries: input.countries, d2Rosters: input.d2Rosters, mode: 'qualifying', previous: input.previousWc }, rng);
  const rating = (id: string) => countryRating(teams[id]);
  const draw: Record<string, number> = {};
  for (const id of input.countries) draw[id] = rng();
  const ranked = [...input.countries].sort((a, b) => rating(b) - rating(a) || draw[a] - draw[b]);
  let auto = ranked.slice(0, 15);
  let rest = ranked.slice(15);
  if (!auto.includes(input.host)) {
    const bumped = auto[14];
    auto = [...auto.slice(0, 14), input.host];
    rest = [bumped, ...rest.filter(id => id !== input.host)];
  }
  const field = [...rest].sort();
  const keys: Record<string, number> = {};
  for (const id of [...input.countries].sort()) keys[id] = draw[id];
  const schedule: ScheduleGame[] = inRounds(sixRegularPairs(field, rng)).map(([home, away], i) => ({ gameNo: i + 1, home, away }));
  const qualifying: QualifyingFile = { league: 'fbawc', season: input.season, host: input.host, auto, field, schedule, keys, games: [], advanced: [] };
  const rosters: RostersFile = { league: 'fbawc', season: input.season, locked: true, teams };
  return {
    ok: true,
    state: { calendar: input.calendar, rosters, qualifying },
    changed: ['fbawc/rosters', 'fbawc/qualifying'],
    label: `Qualifying started: ${field.length} teams, ${schedule.length} games`,
  };
}

export function playQualifyingGame(state: QualifyingState, rng: Rng): WcResult<QualifyingState> {
  const q = state.qualifying;
  if (!q) return wcFail(['Qualifying has not been started']);
  const problem = calendarProblem(state.calendar, qualifyingStepId(q.season), 'Qualifying is played');
  if (problem) return wcFail([problem]);
  const next = q.schedule[q.games.length];
  if (!next) return wcFail(['Every qualifying game has been played']);
  const home = state.rosters.teams[next.home];
  const away = state.rosters.teams[next.away];
  if (!home || !away) return wcFail([`${next.home} or ${next.away} has no roster`]);
  const game = toGameResult(simGame(next.gameNo, simTeam(next.home, home), simTeam(next.away, away), rng));
  return {
    ok: true,
    state: { ...state, qualifying: { ...q, games: [...q.games, game] } },
    changed: ['fbawc/qualifying'],
    label: `Qualifying game ${next.gameNo}: ${next.home} ${game.homePts}-${game.awayPts} ${next.away}`,
  };
}

export function qualifyingTable(q: QualifyingFile): WcTable {
  return rankTable(q.field, q.games, q.keys);
}

export function finishQualifying(state: QualifyingState): WcResult<QualifyingState> {
  const q = state.qualifying;
  if (!q) return wcFail(['Qualifying has not been started']);
  if (q.advanced.length > 0) return wcFail(['Qualifying is already finished']);
  const problem = calendarProblem(state.calendar, qualifyingStepId(q.season), 'Qualifying is finished');
  if (problem) return wcFail([problem]);
  if (q.games.length < q.schedule.length) return wcFail([`${q.schedule.length - q.games.length} qualifying games are still unplayed`]);
  const advanced = qualifyingTable(q).rows.slice(0, 49).map(r => r.teamId);
  return {
    ok: true,
    state: { ...state, calendar: markStepDone(state.calendar, qualifyingStepId(q.season)), qualifying: { ...q, advanced } },
    changed: ['calendar', 'fbawc/qualifying'],
    label: `Qualifying finished: ${advanced.length} advance`,
  };
}
