import type { Rng } from '../d2/random';
import { leagueRefRating } from '../awards/defense';
import { calendarProblem, toGameResult } from '../season/moves';
import type { SimGame } from '../season/sim';
import type { Bracket, BracketGame, JcPostseasonFile } from '../shared/types';
import { awardsComplete } from './awards';
import { playableGames, recordResult } from './bracket';
import { confDone } from './confTourney';
import { addBoxPoints, newBook, playOne, regularSeasonOver } from './play';
import { jcFail, type JcResult, type JcState } from './state';

export type PostStage = 'regular' | 'conf' | 'fields' | 'awards' | 'nit' | 'mm' | 'allAmerican' | 'mvp' | 'finish' | 'done';
export type PostTournament = 'nit' | 'mm';

const allAmericanDone = (state: JcState): boolean =>
  !!state.awards?.allAmerican && state.awards.allAmerican.every(t => t.slots.every(s => s.playerId !== null));

/** Where the FBAJC season is: derived from the saved documents. */
export function postseasonStage(state: JcState): PostStage {
  if (state.summary?.jc) return 'done';
  if (!regularSeasonOver(state)) return 'regular';
  if (!state.postseason || !confDone(state)) return 'conf';
  if (!state.postseason.field) return 'fields';
  if (!awardsComplete(state.awards)) return 'awards';
  if (state.postseason.nit?.champion == null) return 'nit';
  if (state.postseason.mm?.champion == null) return 'mm';
  if (!allAmericanDone(state)) return 'allAmerican';
  if (!state.awards?.mvp.mm || !state.awards.mvp.nit) return 'mvp';
  return 'finish';
}

const bracketOf = (ps: JcPostseasonFile, which: PostTournament): Bracket | null => ps[which];

/** The next game of a tournament in bracket order (lowest round first), for the live page. */
export function nextPostGame(state: JcState, which: PostTournament): BracketGame | null {
  const b = state.postseason ? bracketOf(state.postseason, which) : null;
  return b ? (playableGames(b)[0] ?? null) : null;
}

function stageProblem(state: JcState, which: PostTournament): string | null {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return problem;
  const stage = postseasonStage(state);
  if (stage === which) return null;
  if (which === 'nit') {
    if (stage === 'regular' || stage === 'conf') return 'Finish the conference tournaments first';
    if (stage === 'fields') return 'Set the fields first';
    if (stage === 'awards') return 'Pick every award before the NIT starts';
    return 'The NIT is over';
  }
  if (stage === 'nit') return 'Finish the NIT first';
  if (stage === 'regular' || stage === 'conf' || stage === 'fields' || stage === 'awards') return 'The NIT must be played first';
  return 'March Madness is over';
}

function withBracket(state: JcState, which: PostTournament, bracket: Bracket, nextGameNo: number, rosters?: JcState['rosters']['teams']): JcState {
  return {
    ...state,
    postseason: { ...state.postseason!, [which]: bracket, nextGameNo },
    rosters: rosters ? { ...state.rosters, teams: rosters } : state.rosters,
  };
}

function playRound(state: JcState, which: PostTournament, rng: Rng): JcState | string {
  const problem = stageProblem(state, which);
  if (problem) return problem;
  let bracket = bracketOf(state.postseason!, which)!;
  const games = playableGames(bracket);
  if (!games.length) return 'There is no game to play';
  const book = newBook(state);
  const refRating = leagueRefRating(state.rosters);
  let gameNo = state.postseason!.nextGameNo;
  for (const g of games) {
    const result = playOne(book, gameNo++, g.home!, g.away!, rng, refRating, false);
    if (typeof result === 'string') return result;
    try {
      bracket = recordResult(bracket, g.id, result);
    } catch (e) {
      return (e as Error).message;
    }
  }
  return withBracket(state, which, bracket, gameNo, book.rosters);
}

const LABEL: Record<PostTournament, string> = { nit: 'NIT', mm: 'March Madness' };

/** Plays the lowest unplayed round of the NIT or March Madness in memory. Ratings don't change; points are recorded. */
export function playPostRound(state: JcState, which: PostTournament, rng: Rng): JcResult {
  const r = playRound(state, which, rng);
  if (typeof r === 'string') return jcFail([r]);
  return { ok: true, state: r, changed: ['postseason', 'rosters'], label: `Play ${LABEL[which]} round` };
}

export function playPostToEnd(state: JcState, which: PostTournament, rng: Rng): JcResult {
  let cur = state;
  do {
    const r = playRound(cur, which, rng);
    if (typeof r === 'string') return jcFail([r]);
    cur = r;
  } while (bracketOf(cur.postseason!, which)!.champion === null);
  return { ok: true, state: cur, changed: ['postseason', 'rosters'], label: `Play all of ${LABEL[which]}` };
}

/** Records one live game: it must be the tournament's next game. */
export function recordPostGame(state: JcState, which: PostTournament, sim: SimGame): JcResult {
  const problem = stageProblem(state, which);
  if (problem) return jcFail([problem]);
  const next = nextPostGame(state, which);
  if (!next) return jcFail(['There is no game to play']);
  if (sim.home.teamId !== next.home || sim.away.teamId !== next.away) return jcFail(['That game is not the next one']);
  if (sim.gameNo !== state.postseason!.nextGameNo) return jcFail([`Expected game ${state.postseason!.nextGameNo}`]);
  const book = newBook(state);
  addBoxPoints(book, sim);
  let bracket: Bracket;
  try {
    bracket = recordResult(bracketOf(state.postseason!, which)!, next.id, toGameResult(sim, leagueRefRating(state.rosters)));
  } catch (e) {
    return jcFail([(e as Error).message]);
  }
  return { ok: true, state: withBracket(state, which, bracket, sim.gameNo + 1, book.rosters), changed: ['postseason', 'rosters'], label: `${LABEL[which]} game` };
}
