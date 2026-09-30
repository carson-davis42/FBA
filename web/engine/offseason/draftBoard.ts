import { collegeHole } from '../college/setup';
import { boardPath, collegeName } from '../college/state';
import { POSITIONS } from '../roster/rules';
import { appendTx, withTeam, type MoveContext } from '../roster/state';
import type { WritesResult } from '../season/moves';
import type {
  ClassYear, DraftFile, DraftProspect, PlayersFile, PortalPlayer, Position, RankingFile, RecruitingFile, RosterEntry, RostersFile,
  TeamsFile, TransactionsFile,
} from '../shared/types';
import { draftPath } from './adjustAge';

export interface DraftBoardState {
  season: number;
  draft: DraftFile;
  /** fbajc S{n}. */
  rosters: RostersFile;
  /** The S{n} board, boardPath(n − 1). */
  board: RecruitingFile;
  collegeTeams: TeamsFile;
  players: PlayersFile;
  collegeTx: TransactionsFile;
  /** The fba-reset ranking for S{n}, when it exists. */
  ratings: RankingFile | null;
}

const rostersPath = (n: number) => `leagues/fbajc/S${n}/rosters.json`;
const collegeTxPath = (n: number) => `leagues/fbajc/S${n}/transactions.json`;

const school = (state: DraftBoardState, teamId: string) => state.collegeTeams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
const ratingNote = (rating: number | null) => (rating !== null ? `, ${rating}` : '');

export function draftBoardProblem(draft: DraftFile): string | null {
  return draft.started ? `The S${draft.season} draft has started` : null;
}

const fail = (...problems: string[]): WritesResult => ({ ok: false, problems });

export function declareCandidates(state: DraftBoardState): { playerId: string; teamId: string; position: Position; classYear: ClassYear; rating: number | null }[] {
  const onBoard = new Set([...state.board.recruits, ...state.board.portal].map(p => p.playerId));
  const out: ReturnType<typeof declareCandidates> = [];
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    for (const e of entries) {
      if (!e.playerId || !e.classYear || e.classYear === 'Fr') continue;
      if (state.players.players[e.playerId]?.name == null || onBoard.has(e.playerId)) continue;
      out.push({ playerId: e.playerId, teamId, position: e.position, classYear: e.classYear, rating: e.rating });
    }
  }
  return out.sort((a, b) => school(state, a.teamId).localeCompare(school(state, b.teamId)) || POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));
}

export function declare(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult {
  const started = draftBoardProblem(state.draft);
  if (started) return fail(started);
  const name = collegeName(state.players, playerId);
  const c = declareCandidates(state).find(x => x.playerId === playerId);
  if (!c) return fail(`${name} can't declare`);
  const entries = state.rosters.teams[c.teamId];
  const index = entries.findIndex(e => e.playerId === playerId);
  // After the pro reset is locked, a player who was rated in it (and left the board since) keeps that rating.
  const locked = state.ratings?.locked && state.ratings.rows.some(r => r.playerId === playerId) ? state.ratings.ratings[playerId] : undefined;
  const prospect: DraftProspect = {
    playerId, position: c.position, college: c.teamId, classYear: c.classYear, senior: false,
    collegeRating: c.rating, stars: entries[index].stars ?? null, fbaRating: locked ?? null,
  };
  const rosters = withTeam(state.rosters, c.teamId, entries.map((e, i) => (i === index ? collegeHole(e.position) : e)));
  const tx = appendTx(state.collegeTx, ctx, 'declare', [c.teamId], [`${name} (${c.classYear} ${c.position}, ${school(state, c.teamId)}) declares for the S${state.season} draft`]);
  return {
    ok: true,
    writes: [
      { path: draftPath(state.season), doc: { ...state.draft, prospects: [...state.draft.prospects, prospect] } },
      { path: rostersPath(state.season), doc: rosters },
      { path: collegeTxPath(state.season), doc: tx },
    ],
    label: `${name} declares for the draft`,
  };
}

/** The prospect and the draft without him, or the refusal. */
function leave(state: DraftBoardState, playerId: string, what: string): { p: DraftProspect; draft: DraftFile; name: string } | string {
  const started = draftBoardProblem(state.draft);
  if (started) return started;
  const name = collegeName(state.players, playerId);
  const p = state.draft.prospects.find(x => x.playerId === playerId);
  if (!p) return `${name} isn't on the draft board`;
  if (p.senior) return `Seniors can't ${what}`;
  return { p, name, draft: { ...state.draft, prospects: state.draft.prospects.filter(x => x.playerId !== playerId) } };
}

const toPortal = (p: DraftProspect): PortalPlayer => ({
  playerId: p.playerId, position: p.position, classYear: p.classYear, rating: p.collegeRating, stars: p.stars,
  projections: {}, committedTo: null, fromTeam: p.college,
});

export function backToSchool(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult {
  const r = leave(state, playerId, 'go back to school');
  if (typeof r === 'string') return fail(r);
  const { p, name, draft } = r;
  const entries = state.rosters.teams[p.college] ?? [];
  const index = entries.findIndex(e => e.playerId === null && e.position === p.position);
  if (index >= 0) {
    const entry: RosterEntry = { playerId, position: p.position, rating: p.collegeRating, age: null, points: 0, stars: p.stars, classYear: p.classYear };
    const rosters = withTeam(state.rosters, p.college, entries.map((e, i) => (i === index ? entry : e)));
    const tx = appendTx(state.collegeTx, ctx, 'declare', [p.college], [`${name} returns to ${school(state, p.college)}`]);
    return {
      ok: true,
      writes: [
        { path: draftPath(state.season), doc: draft },
        { path: rostersPath(state.season), doc: rosters },
        { path: collegeTxPath(state.season), doc: tx },
      ],
      label: `${name} returns to ${school(state, p.college)}`,
    };
  }
  const board = { ...state.board, portal: [...state.board.portal, toPortal(p)] };
  const line = `${name} (${p.classYear} ${p.position}${ratingNote(p.collegeRating)}) returns from the draft; his ${school(state, p.college)} spot is taken, so he enters the transfer portal`;
  const tx = appendTx(state.collegeTx, ctx, 'portal', [p.college], [line]);
  return {
    ok: true,
    writes: [
      { path: draftPath(state.season), doc: draft },
      { path: boardPath(state.season - 1), doc: board },
      { path: collegeTxPath(state.season), doc: tx },
    ],
    label: `${name} enters the transfer portal`,
  };
}

export function draftToPortal(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult {
  const r = leave(state, playerId, 'enter the transfer portal');
  if (typeof r === 'string') return fail(r);
  const { p, name, draft } = r;
  const board = { ...state.board, portal: [...state.board.portal, toPortal(p)] };
  const line = `${name} (${p.classYear} ${p.position}${ratingNote(p.collegeRating)}) leaves the draft and enters the transfer portal from ${school(state, p.college)}`;
  const tx = appendTx(state.collegeTx, ctx, 'portal', [p.college], [line]);
  return {
    ok: true,
    writes: [
      { path: draftPath(state.season), doc: draft },
      { path: boardPath(state.season - 1), doc: board },
      { path: collegeTxPath(state.season), doc: tx },
    ],
    label: `${name} enters the transfer portal`,
  };
}

export function setProspectRating(state: DraftBoardState, playerId: string, value: number): WritesResult {
  const started = draftBoardProblem(state.draft);
  if (started) return fail(started);
  if (!state.ratings?.locked) return fail('Finish the pro ratings reset first');
  const name = collegeName(state.players, playerId);
  if (!state.draft.prospects.some(p => p.playerId === playerId)) return fail(`${name} isn't on the draft board`);
  if (state.ratings.rows.some(r => r.playerId === playerId)) return fail(`${name} was rated in the pro reset`);
  if (!Number.isInteger(value) || value < 1 || value > 99) return fail('Enter a whole number from 1 to 99');
  const draft = { ...state.draft, prospects: state.draft.prospects.map(p => (p.playerId === playerId ? { ...p, fbaRating: value } : p)) };
  return { ok: true, writes: [{ path: draftPath(state.season), doc: draft }], label: `${name}: FBA rating ${value}` };
}

/** Prospects in pro-reset rank order when ranked, then the rest by FBA rating, then college rating (nulls last), then name. */
export function boardOrder(state: DraftBoardState): DraftProspect[] {
  const byId = new Map(state.draft.prospects.map(p => [p.playerId, p]));
  const ranked: DraftProspect[] = [];
  for (const id of state.ratings?.order ?? []) {
    const p = byId.get(id);
    if (p) {
      ranked.push(p);
      byId.delete(id);
    }
  }
  const desc = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a);
  const rest = [...byId.values()].sort((a, b) =>
    desc(a.fbaRating, b.fbaRating) || desc(a.collegeRating, b.collegeRating)
    || collegeName(state.players, a.playerId).localeCompare(collegeName(state.players, b.playerId)));
  return [...ranked, ...rest];
}
