import type { Rng } from '../d2/random';
import { leagueRefRating } from '../awards/defense';
import { calendarProblem, toGameResult } from '../season/moves';
import type { SimGame } from '../season/sim';
import { fbajcGateProblem } from '../college/recruiting';
import { markStepDone } from '../shared/calendar';
import type { Bracket, BracketGame, JcPostseasonFile, SummaryFile } from '../shared/types';
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

const scoreText = (winner: number, loser: number): string => `${winner}–${loser}`;

/** The March Madness bracket as a transcribed-style `PastBracket` (a full binary tree R1-1 … R6-1, home feeder first). */
export function pastBracketOf(b: Bracket, nameOf: (teamId: string) => string): NonNullable<SummaryFile['pastBracket']> {
  const final = b.games.find(g => g.next === null)!;
  const feeders = (g: BracketGame): BracketGame[] =>
    b.games.filter(x => x.next?.id === g.id).sort((x, y) => (x.next!.side === 'home' ? -1 : 1) - (y.next!.side === 'home' ? -1 : 1));
  const levels: BracketGame[][] = [[final]];
  for (;;) {
    const up = levels[levels.length - 1].flatMap(feeders);
    if (!up.length) break;
    levels.push(up);
  }
  const rounds = levels.length;
  const series = levels.flatMap((games, depth) => games.map((g, i) => {
    const homeWon = g.result!.homePts > g.result!.awayPts;
    const side = (team: string | null, seed: number | null) => ({ name: nameOf(team!), record: null, seed });
    return {
      id: `R${rounds - depth}-${i + 1}`,
      round: rounds - depth,
      home: side(g.home, g.homeSeed),
      away: side(g.away, g.awaySeed),
      homeWins: homeWon ? 1 : 0,
      awayWins: homeWon ? 0 : 1,
      winner: homeWon ? 'home' as const : 'away' as const,
      score: scoreText(Math.max(g.result!.homePts, g.result!.awayPts), Math.min(g.result!.homePts, g.result!.awayPts)),
    };
  }));
  return { rounds, series };
}

/** The finished season's record: champions, conference champions, awards, All-Americans, MVPs and the March Madness bracket. */
export function buildJcSummary(state: JcState): SummaryFile {
  const ps = state.postseason!;
  const aw = state.awards!;
  const name = (id: string): string => state.teams.teams.find(t => t.teamId === id)?.name ?? id;
  const teamOf = (playerId: string | null): string | null => {
    if (!playerId) return null;
    for (const [teamId, entries] of Object.entries(state.rosters.teams)) if (entries.some(e => e.playerId === playerId)) return teamId;
    return null;
  };
  const finalOf = (b: Bracket, title: string, mvp: string | null) => {
    const f = b.games.find(g => g.next === null)!;
    const r = f.result!;
    const champion = b.champion!;
    const runnerUp = champion === f.home ? f.away! : f.home!;
    return {
      title, champion: name(champion), runnerUp: name(runnerUp),
      score: scoreText(Math.max(r.homePts, r.awayPts), Math.min(r.homePts, r.awayPts)),
      teamId: champion, runnerUpId: runnerUp, group: null, finalsMvp: mvp,
    };
  };
  const mm = ps.mm!;
  const nit = ps.nit!;
  const nitFinal = nit.games.find(g => g.next === null)!;
  return {
    league: 'fbajc',
    season: state.season,
    locked: true,
    host: null,
    champions: [finalOf(mm, 'FBAJC National Champion', aw.mvp.mm), finalOf(nit, 'NIT Champion', aw.mvp.nit)],
    pastBracket: pastBracketOf(mm, name),
    jc: {
      confChampions: ps.conf.map(b => ({ conf: b.id, tournament: b.champion, regularSeason: ps.rsChampions[b.id] ?? [] })),
      national: aw.national.map(a => ({ award: a.award, playerId: a.playerId, teamId: teamOf(a.playerId) })),
      conference: aw.conference.map(a => ({ conf: a.conf, playerId: a.playerId, teamId: teamOf(a.playerId) })),
      allAmerican: aw.allAmerican?.map(t => ({ team: t.team, slots: t.slots.map(s => ({ slot: s.slot, playerId: s.playerId, teamId: teamOf(s.playerId) })) })) ?? null,
      mvp: aw.mvp,
      nit: { champion: nit.champion!, runnerUp: nit.champion === nitFinal.home ? nitFinal.away! : nitFinal.home! },
    },
  };
}

const lock = <T extends { locked: boolean }>(d: T | null): T | null => (d && !d.locked ? { ...d, locked: true } : d);

/** "Finish the season": writes the locked summary, locks the season's docs and marks the `fbajc` calendar step done. */
export function finishJcSeason(state: JcState): JcResult {
  const problems: string[] = [];
  const step = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (step) problems.push(step);
  const stage = postseasonStage(state);
  if (stage === 'done') problems.push(`The S${state.season} FBAJC season is already finished`);
  else if (stage !== 'finish') problems.push('Finish the awards, tournaments, All-American teams and MVP picks first');
  const gate = fbajcGateProblem(state.board, state.rosters);
  if (gate) problems.push(gate);
  if (problems.length) return jcFail(problems);
  return {
    ok: true,
    state: {
      ...state,
      summary: buildJcSummary(state),
      postseason: lock(state.postseason),
      awards: lock(state.awards),
      results: lock(state.results),
      rankings: lock(state.rankings),
      schedule: lock(state.schedule),
      calendar: markStepDone(state.calendar, 'fbajc'),
    },
    changed: ['summary', 'postseason', 'awards', 'results', 'rankings', 'schedule', 'calendar'],
    label: `Finish S${state.season} FBAJC season`,
  };
}
