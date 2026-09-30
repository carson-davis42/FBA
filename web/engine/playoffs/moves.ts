import { leagueRefRating } from '../awards/defense';
import { leagueStepProblem, toGameResult } from '../season/moves';
import type { SimGame } from '../season/sim';
import { PLAYOFF_SEEDS, records, SEASON_LENGTH, standings, type Standings } from '../season/standings';
import { PAUSE_LABEL, playerName, seasonFail, seasonOver, type SeasonResult, type SeasonState } from '../season/state';
import type { PlayoffGame, PlayoffsFile } from '../shared/types';
import { advance, buildBracket, finalId, FINALS, hostOf } from './bracket';
import { groupLabel } from '../shared/leagues';
import { promotion } from './promotion';
import { powerRankings } from './ranker';
import { betterAcross } from './tiebreak';

const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;

export function seasonStandings(state: SeasonState): Standings {
  const teams = state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
  return standings(state.league, teams, state.results?.games ?? [], SEASON_LENGTH[state.league], state.playoffs);
}

/** Each group's top 8 from the current standings, with the notes for ties that involve them. */
export function seedPreview(state: SeasonState): PlayoffsFile['seeds'] {
  return seasonStandings(state).groups.map(g => {
    const teams = g.rows.slice(0, PLAYOFF_SEEDS).map(r => r.teamId);
    return { group: g.group, teams, notes: g.notes.filter(n => n.teams.some(t => teams.includes(t))).map(n => n.text) };
  });
}

export function lockSeeds(state: SeasonState): SeasonResult {
  const problems: string[] = [];
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) problems.push(step);
  if (state.playoffs) problems.push('The playoff seeds are already locked');
  if (!seasonOver(state)) problems.push('Finish the regular season first');
  const open = state.schedule?.pauses.find(p => !p.done);
  if (open) problems.push(`Finish the ${PAUSE_LABEL[open.kind]} pause (after game ${open.afterGame}) first`);
  if (!state.awards?.locked) problems.push(`Lock the S${state.season} awards first`);
  if (problems.length) return seasonFail(problems);
  const seeds = seedPreview(state);
  const short = seeds.filter(s => s.teams.length < PLAYOFF_SEEDS).map(s => `${s.group} needs at least ${PLAYOFF_SEEDS} teams`);
  if (short.length) return seasonFail(short);
  const { series, queue } = buildBracket(state.league, seeds);
  const playoffs: PlayoffsFile = { league: state.league, season: state.season, locked: false, seeds, series, queue, games: [], outcome: null };
  return {
    ok: true,
    state: { ...state, playoffs },
    changed: ['playoffs'],
    label: `Lock S${state.season} ${LEAGUE_NAME[state.league]} playoff seeds`,
  };
}

export interface NextPlayoffGame { gameNo: number; seriesId: string; gameInSeries: number; home: string; away: string }

/** The game at the front of the rotation, or null before seeding and after the last final. */
export function nextPlayoffGame(pf: PlayoffsFile | null): NextPlayoffGame | null {
  if (!pf || pf.outcome || !pf.queue.length) return null;
  const s = pf.series.find(x => x.id === pf.queue[0]);
  if (!s) return null;
  const gameInSeries = s.homeWins + s.awayWins + 1;
  return { gameNo: pf.games.length + 1, seriesId: s.id, gameInSeries, ...hostOf(s, gameInSeries) };
}

/** Champions (and D2 promotion) once every final is decided; null before then. */
function outcomeOf(state: SeasonState, pf: PlayoffsFile): PlayoffsFile['outcome'] {
  const ids = state.league === 'fba' ? [FINALS] : pf.seeds.map(s => finalId('fbad2', s.group));
  const finals = ids.map(id => pf.series.find(s => s.id === id));
  if (finals.some(s => !s?.winner)) return null;
  const champions = finals.map(s => {
    const teamId = s!.winner!;
    return {
      group: s!.group,
      teamId,
      runnerUp: teamId === s!.home ? s!.away! : s!.home!,
      score: `${Math.max(s!.homeWins, s!.awayWins)}–${Math.min(s!.homeWins, s!.awayWins)}`,
    };
  });
  if (state.league !== 'fbad2') return { champions, promotion: null };
  const order = Object.fromEntries(seasonStandings(state).groups.map(g => [g.group, g.rows.map(r => r.teamId)]));
  return { champions, promotion: promotion(order, Object.fromEntries(champions.map(c => [c.group!, c.teamId]))) };
}

/** Saves a watched playoff game, which must be the front of the rotation. The last final sets the outcome. */
export function recordPlayoffGame(state: SeasonState, sim: SimGame): SeasonResult {
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) return seasonFail([step]);
  const pf = state.playoffs;
  const next = nextPlayoffGame(pf);
  if (!pf || !next) return seasonFail(['No playoff game is due']);
  if (sim.gameNo !== next.gameNo || sim.home.teamId !== next.home || sim.away.teamId !== next.away) {
    return seasonFail([`This isn't the next playoff game (next is game ${next.gameNo}: ${next.away} @ ${next.home})`]);
  }
  const game: PlayoffGame = { ...toGameResult(sim, leagueRefRating(state.rosters)), seriesId: next.seriesId, gameInSeries: next.gameInSeries };
  const winner = game.homePts > game.awayPts ? game.home : game.away;
  const recs = records(state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? []);
  let ranked: string[] | null = null;
  const ranks = () => {
    if (ranked === null) ranked = powerRankings(state.results?.games ?? []);
    return ranked;
  };
  const better = (a: string, b: string) => betterAcross(recs.get(a)!, recs.get(b)!, ranks);
  const moved = advance(pf, next.seriesId, winner, better);
  let playoffs: PlayoffsFile = { ...pf, series: moved.series, queue: moved.queue, games: [...pf.games, game] };
  const outcome = outcomeOf(state, playoffs);
  if (outcome) playoffs = { ...playoffs, outcome };
  // The league's calendar step stays current until "Finish S{n} season" (engine/season/wrapUp.ts).
  return {
    ok: true,
    state: { ...state, playoffs },
    changed: ['playoffs'],
    label: `Playoff game ${game.gameNo}: ${game.away} ${game.awayPts} @ ${game.home} ${game.homePts}`,
  };
}

export interface FinalsMvpCandidate { playerId: string; name: string; gp: number; ppg: number }

const round1 = (x: number) => Math.round(x * 10) / 10;
const mvpTitle = (group: string | null) => (group === null ? 'Finals MVP' : `${groupLabel('fbad2', group)} Series MVP`);

/** The champion entry for a group (null for the FBA), or null before the outcome. */
function championOf(state: SeasonState, group: string | null) {
  return state.playoffs?.outcome?.champions.find(c => c.group === group) ?? null;
}

/** The champion's players who played in the final, by points per game (then name). */
export function finalsMvpCandidates(state: SeasonState, group: string | null): FinalsMvpCandidate[] {
  const champ = championOf(state, group);
  if (!champ || !state.playoffs) return [];
  const seriesId = group === null ? FINALS : finalId('fbad2', group);
  const totals = new Map<string, { gp: number; pts: number }>();
  for (const g of state.playoffs.games) {
    if (g.seriesId !== seriesId) continue;
    const side = g.home === champ.teamId ? 'home' : g.away === champ.teamId ? 'away' : null;
    if (!side) continue;
    for (const line of g.box?.[side] ?? []) {
      const t = totals.get(line.playerId) ?? { gp: 0, pts: 0 };
      t.gp++;
      t.pts += line.pts;
      totals.set(line.playerId, t);
    }
  }
  return [...totals].map(([playerId, t]) => ({ playerId, name: playerName(state, playerId), gp: t.gp, ppg: round1(t.pts / t.gp) }))
    .sort((a, b) => b.ppg - a.ppg || a.name.localeCompare(b.name));
}

/** Picks (or re-picks) the Finals MVP, or a D2 league's Series MVP, from the champion's players in the final. */
export function pickFinalsMvp(state: SeasonState, group: string | null, playerId: string): SeasonResult {
  const champ = championOf(state, group);
  if (!champ || !state.playoffs) return seasonFail(['No champion yet']);
  if (state.summary) return seasonFail(['The season is finished']);
  const cand = finalsMvpCandidates(state, group).find(c => c.playerId === playerId);
  if (!cand) return seasonFail([`${playerName(state, playerId)} didn't play in the final`]);
  const outcome = state.playoffs.outcome!;
  const playoffs: PlayoffsFile = {
    ...state.playoffs,
    outcome: { ...outcome, champions: outcome.champions.map(c => (c.group === group ? { ...c, finalsMvp: playerId } : c)) },
  };
  return { ok: true, state: { ...state, playoffs }, changed: ['playoffs'], label: `Pick the ${mvpTitle(group)}` };
}
