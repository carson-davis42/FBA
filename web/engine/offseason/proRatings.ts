import { collegeName } from '../college/state';
import { rankingBlockers, suggestionsTaken, syncRows } from '../rank/ranking';
import { appendTx, docPath, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, DraftFile, PlayersFile, RankingFile, RankingRow, RatingPauseFile, RostersFile, TeamsFile, TransactionsFile } from '../shared/types';
import { draftPath } from './adjustAge';

export const PRO_RATINGS_STEP = 'adjust-pro-ratings-reset';
/** leagues/fba/S{season}/ratings.json: the pro ratings reset of that season. */
export const proRatingsPath = (season: number) => `leagues/fba/S${season}/ratings.json`;

export interface ProRatingsState {
  season: number;
  calendar: CalendarFile;
  /** This season's FBA rosters (already aged). */
  fba: RostersFile;
  /** Last season's FBA rosters (for the points stat); null if missing. */
  prevFba: RostersFile | null;
  /** The S{season} draft board; null until Adjust Age has run. */
  draft: DraftFile | null;
  players: PlayersFile;
  collegeTeams: TeamsFile;
  ratings: RankingFile | null;
  /** The previous pro reset (S{season − 1}), for the suggestion curve. */
  prevRatings: RankingFile | null;
  /** Last season's first 'ratings' pause, the fallback for the curve. */
  pause: RatingPauseFile | null;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
}

const MIN_RATING = 1;
const MAX_RATING = 99;

const stepProblem = (state: ProRatingsState) => calendarProblem(state.calendar, PRO_RATINGS_STEP, 'Pro ratings are reset');
const nameOf = (state: ProRatingsState) => (id: string) => collegeName(state.players, id);

/** Last season's rating for an FBA player: the finished reset, else the ratings pause, else the roster rating. */
function prevRatingOf(state: ProRatingsState, playerId: string, rosterRating: number | null): number | null {
  if (state.prevRatings?.locked && state.prevRatings.ratings[playerId] !== undefined) return state.prevRatings.ratings[playerId];
  const paused = state.pause?.players.find(p => p.playerId === playerId);
  if (paused) return paused.oldRating;
  return rosterRating;
}

/** Everyone being ranked: the FBA roster players (team order), then the draft prospects. */
export function proRatingRows(state: ProRatingsState): RankingRow[] {
  const points = new Map<string, number>();
  for (const e of Object.values(state.prevFba?.teams ?? {}).flat()) {
    if (e.playerId) points.set(e.playerId, (points.get(e.playerId) ?? 0) + e.points);
  }
  const rows: RankingRow[] = [];
  for (const [teamId, entries] of Object.entries(state.fba.teams)) {
    for (const e of entries) {
      if (e.playerId === null) continue;
      rows.push({
        playerId: e.playerId,
        position: e.position,
        age: e.age,
        team: teamId,
        prevRating: prevRatingOf(state, e.playerId, e.rating),
        otherRating: null,
        stat: points.has(e.playerId) ? `S${state.season - 1}: ${points.get(e.playerId)} pts` : null,
      });
    }
  }
  for (const p of state.draft?.prospects ?? []) {
    const birth = state.players.players[p.playerId]?.birthSeason ?? null;
    const abbr = state.collegeTeams.teams.find(t => t.teamId === p.college)?.abbr ?? p.college;
    rows.push({
      playerId: p.playerId,
      position: p.position,
      age: birth === null ? null : state.season - birth,
      team: null,
      prevRating: null,
      otherRating: p.collegeRating,
      stat: `${p.classYear} · ${abbr}`,
    });
  }
  return rows;
}

/** The suggestion ladder (high to low): last season's finished reset, else the ratings pause, else the current roster ratings. */
export function proCurve(state: ProRatingsState): number[] {
  let source: number[];
  if (state.prevRatings?.locked) source = Object.values(state.prevRatings.ratings);
  else if (state.pause && state.pause.players.length) source = state.pause.players.map(p => p.oldRating);
  else source = Object.values(state.fba.teams).flat().flatMap(e => (e.playerId !== null && e.rating !== null ? [e.rating] : []));
  return source.map(v => Math.max(MIN_RATING, Math.min(MAX_RATING, v))).sort((a, b) => b - a);
}

export function startProRatings(state: ProRatingsState): WritesResult {
  const problem = stepProblem(state);
  if (problem) return { ok: false, problems: [problem] };
  if (!state.draft) return { ok: false, problems: ['Run Adjust Age first'] };
  if (state.ratings) return { ok: false, problems: ['The pro ratings reset has already started'] };
  const ratings: RankingFile = {
    league: 'fba', season: state.season, kind: 'fba-reset', locked: false, rows: proRatingRows(state), order: [], ratings: {}, curve: proCurve(state),
  };
  return { ok: true, writes: [{ path: proRatingsPath(state.season), doc: ratings }], label: 'Start the pro ratings reset' };
}

/** The ranking must list exactly the current pool: nobody missing, nobody who has left it. */
export function proMembershipBlockers(state: ProRatingsState): string[] {
  if (!state.ratings) return [];
  const listed = new Set(state.ratings.rows.map(r => r.playerId));
  const present = new Set(proRatingRows(state).map(r => r.playerId));
  const name = nameOf(state);
  const out: string[] = [];
  for (const id of present) if (!listed.has(id)) out.push(`${name(id)} isn't in the ratings list`);
  for (const r of state.ratings.rows) if (!present.has(r.playerId)) out.push(`${name(r.playerId)} is no longer on an FBA roster or the draft board`);
  return out;
}

/** Brings the list in line with the current pool (see `syncRows`). */
export function syncProRatings(state: ProRatingsState): WritesResult {
  if (!state.ratings) return { ok: false, problems: ['Start the pro ratings reset first'] };
  if (state.ratings.locked) return { ok: false, problems: ['Pro ratings are already finished'] };
  const doc = syncRows(state.ratings, proRatingRows(state));
  return { ok: true, writes: [{ path: proRatingsPath(state.season), doc }], label: 'Sync the pro ratings list' };
}

export function proRatingsBlockers(state: ProRatingsState): string[] {
  if (!state.ratings) return ['Start the pro ratings reset first'];
  if (state.ratings.locked) return ['Pro ratings are already finished'];
  return [...rankingBlockers(state.ratings, nameOf(state)), ...proMembershipBlockers(state)];
}

export function finishProRatings(state: ProRatingsState, ctx: MoveContext): WritesResult {
  const problem = stepProblem(state);
  if (problem) return { ok: false, problems: [problem] };
  const blockers = proRatingsBlockers(state);
  if (blockers.length) return { ok: false, problems: blockers };
  if (!state.draft) return { ok: false, problems: ['Run Adjust Age first'] };
  const ratings = state.ratings!;
  const next = new Map(Object.entries(ratings.ratings));
  const teams = Object.fromEntries(Object.entries(state.fba.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId !== null && next.has(e.playerId) ? { ...e, rating: next.get(e.playerId)! } : e)),
  ]));
  const draft: DraftFile = {
    ...state.draft,
    prospects: state.draft.prospects.map(p => (next.has(p.playerId) ? { ...p, fbaRating: next.get(p.playerId)! } : p)),
  };
  const prospects = new Set(state.draft.prospects.map(p => p.playerId));
  const nProspects = ratings.rows.filter(r => prospects.has(r.playerId)).length;
  const line = `FBA ratings reset: ${ratings.rows.length - nProspects} players and ${nProspects} prospects ranked, ${suggestionsTaken(ratings)} took the suggestion`;
  return {
    ok: true,
    writes: [
      { path: proRatingsPath(state.season), doc: { ...ratings, locked: true } },
      { path: docPath('fba', state.season), doc: { ...state.fba, teams } },
      { path: draftPath(state.season), doc: draft },
      { path: docPath('fbaTx', state.season), doc: appendTx(state.tx, ctx, 'fba-ratings', [], [line]) },
      { path: 'calendar.json', doc: markStepDone(state.calendar, PRO_RATINGS_STEP) },
    ],
    label: 'Finish the pro ratings reset',
  };
}
