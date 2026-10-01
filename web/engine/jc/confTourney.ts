import type { Rng } from '../d2/random';
import { leagueRefRating } from '../awards/defense';
import { calendarProblem } from '../season/moves';
import { JC_FIRST_POST_GAME, type Bracket, type GameResult, type JcPostseasonFile } from '../shared/types';
import { buildBracket, bracketResults, playableGames, recordResult, type NewGame } from './bracket';
import { blendRankings } from './rankings';
import { newBook, playOne, regularSeasonOver } from './play';
import { jcFail, type JcResult, type JcState } from './state';
import { jcStandings } from './standings';

const TOTAL_GAMES = 3132;

/** Every postseason game played so far, in game-number order. */
export function postseasonGames(ps: JcPostseasonFile | null): GameResult[] {
  if (!ps) return [];
  return [...ps.conf.flatMap(bracketResults), ...bracketResults(ps.nit), ...bracketResults(ps.mm)].sort((a, b) => a.gameNo - b.gameNo);
}

/** The latest blended ranking, best first, or null before the first snapshot. */
export const latestRanking = (state: JcState): string[] | null => state.rankings?.snapshots.at(-1)?.order ?? null;

/** Each conference's standings after the 22 games: the 12 teams in table order, and the teams sharing the best conference record. */
export function confTables(state: JcState): { conference: string; order: string[]; champions: string[] }[] {
  const tables = jcStandings({ teams: state.teams, games: state.results?.games ?? [], ranking: latestRanking(state), drawKeys: state.schedule?.drawKeys ?? {} });
  return tables.map(t => {
    const best = Math.max(...t.rows.map(r => r.confW));
    return { conference: t.conference, order: t.rows.map(r => r.teamId), champions: t.rows.filter(r => r.confW === best).map(r => r.teamId) };
  });
}

/** `PostSeasonTourny.java`: 12 teams, round 1 8v9, 5v12, 6v11, 7v10; seeds 1-4 have byes; 11 games. */
export function confBracket(conference: string, seeded: string[]): Bracket {
  const t = (seed: number): string => seeded[seed - 1];
  const game = (id: string, round: number, next: NewGame['next'], home: number | null, away: number | null): NewGame => ({
    id, round, region: 0, home: home === null ? null : t(home), away: away === null ? null : t(away),
    homeSeed: home, awaySeed: away, next,
  });
  return buildBracket(conference, 'conf', conference, [
    game('G1', 1, { id: 'G5', side: 'away' }, 8, 9),
    game('G2', 1, { id: 'G6', side: 'away' }, 5, 12),
    game('G3', 1, { id: 'G7', side: 'away' }, 6, 11),
    game('G4', 1, { id: 'G8', side: 'away' }, 7, 10),
    game('G5', 2, { id: 'G9', side: 'home' }, 1, null),
    game('G6', 2, { id: 'G9', side: 'away' }, 4, null),
    game('G7', 2, { id: 'G10', side: 'away' }, 3, null),
    game('G8', 2, { id: 'G10', side: 'home' }, 2, null),
    game('G9', 3, { id: 'G11', side: 'home' }, null, null),
    game('G10', 3, { id: 'G11', side: 'away' }, null, null),
    game('G11', 4, null, null, null),
  ]);
}

export function startConfTournaments(state: JcState): JcResult {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return jcFail([problem]);
  if (!regularSeasonOver(state)) return jcFail(['Play all 29 days first']);
  if (state.postseason) return jcFail(['The conference tournaments have already started']);
  const tables = confTables(state);
  const postseason: JcPostseasonFile = {
    league: 'fbajc', season: state.season, locked: false, nextGameNo: JC_FIRST_POST_GAME,
    conf: tables.map(t => confBracket(t.conference, t.order)),
    rsChampions: Object.fromEntries(tables.map(t => [t.conference, t.champions])),
    field: null, nit: null, mm: null,
  };
  return { ok: true, state: { ...state, postseason }, changed: ['postseason'], label: 'Start conference tournaments' };
}

export const confDone = (state: JcState): boolean => !!state.postseason && state.postseason.conf.every(b => b.champion !== null);

/** Plays the lowest unplayed round of every conference tournament (same round number everywhere), in memory. */
export function playConfRound(state: JcState, rng: Rng): JcResult {
  const r = confRound(state, rng);
  if (typeof r === 'string') return jcFail([r]);
  return { ok: true, state: r, changed: ['postseason', 'rosters', 'rankings'], label: 'Play conference tournament round' };
}

export function playAllConf(state: JcState, rng: Rng): JcResult {
  let cur = state;
  do {
    const r = confRound(cur, rng);
    if (typeof r === 'string') return jcFail([r]);
    cur = r;
  } while (!confDone(cur));
  return { ok: true, state: cur, changed: ['postseason', 'rosters', 'rankings'], label: 'Play all conference tournaments' };
}

function confRound(state: JcState, rng: Rng): JcState | string {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return problem;
  const ps = state.postseason;
  if (!ps) return 'Start the conference tournaments first';
  if (confDone(state)) return 'The conference tournaments are over';
  const open = ps.conf.flatMap(b => playableGames(b).map(g => ({ b, g })));
  const round = Math.min(...open.map(x => x.g.round));
  const book = newBook(state);
  const refRating = leagueRefRating(state.rosters);
  const busy = new Set<string>();
  let gameNo = ps.nextGameNo;
  const conf = ps.conf.map(b => ({ ...b }));
  for (const { b, g } of open) {
    if (g.round !== round) continue;
    for (const t of [g.home!, g.away!]) {
      if (busy.has(t)) return `${t} plays twice in round ${round}`;
      busy.add(t);
    }
    const result = playOne(book, gameNo++, g.home!, g.away!, rng, refRating, true);
    if (typeof result === 'string') return result;
    try {
      const i = conf.findIndex(x => x.id === b.id);
      conf[i] = recordResult(conf[i], g.id, result);
    } catch (e) {
      return (e as Error).message;
    }
  }
  const postseason: JcPostseasonFile = { ...ps, conf, nextGameNo: gameNo };
  const games = [...(state.results?.games ?? []), ...postseasonGames(postseason)];
  const order = blendRankings({ teams: book.teamIds, ratings: book.ratings, games, totalGames: TOTAL_GAMES }, rng);
  const rankings = state.rankings ?? { league: 'fbajc' as const, season: state.season, locked: false, snapshots: [] };
  return {
    ...state,
    postseason,
    rosters: { ...state.rosters, teams: book.rosters },
    rankings: { ...rankings, snapshots: [...rankings.snapshots, { afterDay: 29 + round, order }] },
  };
}
