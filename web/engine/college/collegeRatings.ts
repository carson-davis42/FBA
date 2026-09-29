import { d2Curve } from '../d2/ratings';
import { rankingBlockers, suggestionsTaken } from '../rank/ranking';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import { calendarProblem, type WritesResult } from '../season/moves';
import type { CalendarFile, PlayersFile, RankingFile, RankingRow, RecruitingFile, RostersFile, TransactionsFile } from '../shared/types';
import { boardPath, collegeName } from './state';

/** leagues/fbajc/S{season}/ratings.json: the college ratings reset of that season. */
export const collegeRatingsPath = (season: number) => `leagues/fbajc/S${season}/ratings.json`;
export const COLLEGE_RATINGS_STEP = 'adjust-college-ratings';

export interface CollegeRatingsState {
  /** The calendar season. */
  season: number;
  /** The board of the class that plays this season (board S{season − 1}): its recruits keep their ratings and its portal is ranked. */
  board: RecruitingFile;
  /** This season's college rosters. */
  rosters: RostersFile;
  /** Last season's college rosters (for the points stat); null if missing. */
  prevRosters: RostersFile | null;
  players: PlayersFile;
  ratings: RankingFile | null;
  /** The previous college reset, for the suggestion curve. */
  prevRatings: RankingFile | null;
  calendar: CalendarFile;
  /** This season's FBAJC transactions. */
  tx: TransactionsFile;
}

const stepProblem = (state: CollegeRatingsState) => calendarProblem(state.calendar, COLLEGE_RATINGS_STEP, 'College ratings are adjusted');

/**
 * The players being ranked: named roster players who aren't in this season's class (rosters in team order), then the portal players
 * not on a roster. A portal player who has committed sits on a roster and is listed there; an uncommitted one has team null.
 */
export function collegeRatingRows(state: CollegeRatingsState): RankingRow[] {
  const recruits = new Set(state.board.recruits.map(r => r.playerId));
  const points = new Map<string, number>();
  for (const e of Object.values(state.prevRosters?.teams ?? {}).flat()) {
    if (e.playerId) points.set(e.playerId, (points.get(e.playerId) ?? 0) + e.points);
  }
  const row = (playerId: string, position: RankingRow['position'], team: string | null, rating: number | null): RankingRow => ({
    playerId,
    position,
    age: null,
    team,
    prevRating: rating,
    otherRating: null,
    stat: points.has(playerId) ? `S${state.season - 1}: ${points.get(playerId)} pts` : null,
  });
  const rows: RankingRow[] = [];
  const listed = new Set<string>();
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    for (const e of entries) {
      if (e.playerId === null || recruits.has(e.playerId) || state.players.players[e.playerId]?.name == null) continue;
      rows.push(row(e.playerId, e.position, teamId, e.rating));
      listed.add(e.playerId);
    }
  }
  for (const p of state.board.portal) if (!listed.has(p.playerId)) rows.push(row(p.playerId, p.position, p.committedTo, p.rating));
  return rows;
}

export function startCollegeRatings(state: CollegeRatingsState): WritesResult {
  if (state.ratings) return { ok: false, problems: ['The ratings reset has already started'] };
  const problem = stepProblem(state);
  if (problem) return { ok: false, problems: [problem] };
  const rows = collegeRatingRows(state);
  const ratings: RankingFile = {
    league: 'fbajc', season: state.season, kind: 'college-reset', locked: false, rows, order: [], ratings: {}, curve: d2Curve(state.prevRatings, rows),
  };
  return { ok: true, writes: [{ path: collegeRatingsPath(state.season), doc: ratings }], label: 'Start college ratings reset' };
}

/** The ranking must list exactly the current pool: nobody missing, nobody who has left it. */
export function collegeMembershipBlockers(state: CollegeRatingsState): string[] {
  if (!state.ratings) return [];
  const listed = new Set(state.ratings.rows.map(r => r.playerId));
  const present = new Set(collegeRatingRows(state).map(r => r.playerId));
  const name = (id: string) => collegeName(state.players, id);
  const out: string[] = [];
  for (const id of present) if (!listed.has(id)) out.push(`${name(id)} isn't in the ratings list`);
  for (const r of state.ratings.rows) if (!present.has(r.playerId)) out.push(`${name(r.playerId)} is no longer on a college roster or in the portal`);
  return out;
}

export function collegeRatingsBlockers(state: CollegeRatingsState): string[] {
  if (!state.ratings) return ['Start the ratings reset first'];
  if (state.ratings.locked) return ['College ratings are already finished'];
  return [...rankingBlockers(state.ratings, id => collegeName(state.players, id)), ...collegeMembershipBlockers(state)];
}

export function finishCollegeRatings(state: CollegeRatingsState, ctx: MoveContext): WritesResult {
  const problem = stepProblem(state);
  if (problem) return { ok: false, problems: [problem] };
  const blockers = collegeRatingsBlockers(state);
  if (blockers.length) return { ok: false, problems: blockers };
  const ratings = state.ratings!;
  const next = new Map(Object.entries(ratings.ratings));
  const teams = Object.fromEntries(Object.entries(state.rosters.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId !== null && next.has(e.playerId) ? { ...e, rating: next.get(e.playerId)! } : e)),
  ]));
  const board: RecruitingFile = { ...state.board, portal: state.board.portal.map(p => (next.has(p.playerId) ? { ...p, rating: next.get(p.playerId)! } : p)) };
  const line = `College ratings reset: ${ratings.rows.length} players ranked, ${suggestionsTaken(ratings)} took the suggestion`;
  return {
    ok: true,
    writes: [
      { path: collegeRatingsPath(state.season), doc: { ...ratings, locked: true } },
      { path: `leagues/fbajc/S${state.season}/rosters.json`, doc: { ...state.rosters, teams } },
      { path: boardPath(state.board.season), doc: board },
      { path: `leagues/fbajc/S${state.season}/transactions.json`, doc: appendTx(state.tx, ctx, 'college-ratings', [], [line]) },
      { path: 'calendar.json', doc: markStepDone(state.calendar, COLLEGE_RATINGS_STEP) },
    ],
    label: 'Finish college ratings',
  };
}
