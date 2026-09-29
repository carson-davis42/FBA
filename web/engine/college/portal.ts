import { POSITIONS } from '../roster/rules';
import { appendTx, withTeam, type MoveContext } from '../roster/state';
import type { CalendarFile, ClassYear, PortalPlayer, Position, RosterEntry } from '../shared/types';
import { collegeHole } from './setup';
import { collegeName, recruitingFail, schoolName, type RecruitingResult, type RecruitingState } from './state';

/** Open from when make-s{n}-schedules is done until the fbajc step is done; otherwise the reason it's closed. */
export function portalProblem(calendar: CalendarFile): string | null {
  const n = calendar.season;
  if (calendar.steps.find(s => s.id === 'fbajc')?.done) return `The S${n} transfer portal is closed`;
  if (!calendar.steps.find(s => s.id === `make-s${n}-schedules`)?.done) {
    return `The S${n} transfer portal opens when the offseason ends (after Make S${n} Schedules)`;
  }
  return null;
}

export interface PortalCandidate { playerId: string; teamId: string; position: Position; classYear: ClassYear; rating: number | null }

const RETURNING: ClassYear[] = ['So', 'Jr', 'Sr'];

/** Named So/Jr/Sr on the rosters, not on the board (recruit or portal). Sorted by school, then position. */
export function portalCandidates(state: RecruitingState): PortalCandidate[] {
  const onBoard = new Set([...state.recruiting.recruits, ...state.recruiting.portal].map(p => p.playerId));
  const out: PortalCandidate[] = [];
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    for (const e of entries) {
      if (e.playerId === null || !e.classYear || !RETURNING.includes(e.classYear)) continue;
      if (state.players.players[e.playerId]?.name == null || onBoard.has(e.playerId)) continue;
      out.push({ playerId: e.playerId, teamId, position: e.position, classYear: e.classYear, rating: e.rating });
    }
  }
  return out.sort((a, b) =>
    schoolName(state, a.teamId).localeCompare(schoolName(state, b.teamId)) || POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));
}

/** The board's portal, highest rating first (null ratings last), ties by name. */
export function portalByRating(state: RecruitingState): PortalPlayer[] {
  return [...state.recruiting.portal].sort((a, b) =>
    (b.rating ?? -1) - (a.rating ?? -1) || collegeName(state.players, a.playerId).localeCompare(collegeName(state.players, b.playerId)));
}

const ratingNote = (rating: number | null) => (rating !== null ? `, ${rating}` : '');

/** The portal belongs to the board of the class that plays this season. */
function boardProblem(state: RecruitingState): string | null {
  return state.recruiting.classOf === state.season ? null : `The portal belongs to the S${state.season} class board`;
}

/** These players enter the transfer portal: their spots become holes and each joins the board's portal. */
export function enterPortal(state: RecruitingState, playerIds: string[], ctx: MoveContext): RecruitingResult {
  const board = boardProblem(state);
  if (board) return recruitingFail([board]);
  const closed = portalProblem(state.calendar);
  if (closed) return recruitingFail([closed]);
  const ids = [...new Set(playerIds)];
  if (!ids.length) return recruitingFail(['Pick at least one player']);
  const candidates = new Map(portalCandidates(state).map(c => [c.playerId, c]));
  const bad = ids.filter(id => !candidates.has(id)).map(id => `${collegeName(state.players, id)} can't enter the portal`);
  if (bad.length) return recruitingFail(bad);

  let rosters = state.rosters;
  let tx = state.tx;
  const entered: PortalPlayer[] = [];
  for (const id of ids) {
    const { teamId } = candidates.get(id)!;
    const entries = rosters.teams[teamId];
    const index = entries.findIndex(e => e.playerId === id);
    const held = entries[index];
    entered.push({
      playerId: id, position: held.position, classYear: held.classYear!, rating: held.rating, stars: held.stars ?? null, projections: {}, committedTo: null, fromTeam: teamId,
    });
    rosters = withTeam(rosters, teamId, entries.map((e, i) => (i === index ? collegeHole(e.position) : e)));
    tx = appendTx(tx, ctx, 'portal', [teamId], [
      `${collegeName(state.players, id)} (${held.classYear} ${held.position}${ratingNote(held.rating)}) enters the transfer portal from ${schoolName(state, teamId)}`,
    ]);
  }
  const k = entered.length;
  return {
    ok: true,
    state: { ...state, recruiting: { ...state.recruiting, portal: [...state.recruiting.portal, ...entered] }, rosters, tx },
    changed: ['recruiting', 'rosters', 'tx'],
    label: `${k} ${k === 1 ? 'player enters' : 'players enter'} the transfer portal`,
  };
}

/** An uncommitted portal player goes back to their old spot, if it is still open. */
export function takeOutOfPortal(state: RecruitingState, playerId: string, ctx: MoveContext): RecruitingResult {
  const board = boardProblem(state);
  if (board) return recruitingFail([board]);
  const p = state.recruiting.portal.find(x => x.playerId === playerId);
  if (!p) return recruitingFail([`${playerId} isn't in the transfer portal`]);
  const name = collegeName(state.players, playerId);
  if (p.committedTo) return recruitingFail([`Decommit ${name} first`]);
  const school = schoolName(state, p.fromTeam);
  const entries = state.rosters.teams[p.fromTeam] ?? [];
  const index = entries.findIndex(e => e.position === p.position);
  if (index < 0 || entries[index].playerId !== null) return recruitingFail([`${name}'s spot at ${school} has been filled`]);
  const back: RosterEntry = { playerId, position: p.position, rating: p.rating, age: null, points: 0, stars: p.stars, classYear: p.classYear };
  const line = `${name} leaves the transfer portal and stays at ${school}`;
  return {
    ok: true,
    state: {
      ...state,
      recruiting: { ...state.recruiting, portal: state.recruiting.portal.filter(x => x.playerId !== playerId) },
      rosters: withTeam(state.rosters, p.fromTeam, entries.map((e, i) => (i === index ? back : e))),
      tx: appendTx(state.tx, ctx, 'portal', [p.fromTeam], [line]),
    },
    changed: ['recruiting', 'rosters', 'tx'],
    label: line,
  };
}
