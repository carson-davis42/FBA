import { collegeHole } from '../college/setup';
import { boardPath, collegeName } from '../college/state';
import { boosted } from '../rank/classBoost';
import { rankedProspects } from './prospectOutlook';
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
}

const rostersPath = (n: number) => `leagues/fbajc/S${n}/rosters.json`;
const collegeTxPath = (n: number) => `leagues/fbajc/S${n}/transactions.json`;

const school = (state: DraftBoardState, teamId: string) => state.collegeTeams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
const ratingNote = (rating: number | null) => (rating !== null ? `, ${rating}` : '');

export function draftBoardProblem(draft: DraftFile): string | null {
  return draft.started ? `The S${draft.season} draft has started` : null;
}

const fail = (...problems: string[]): WritesResult => ({ ok: false, problems });

/** Adjust Age moves everyone up a class; a draft prospect keeps the class he was in the season before (a graduate is a Sr). */
const LAST_YEAR: Record<ClassYear, ClassYear> = { Fr: 'Fr', So: 'Fr', Jr: 'So', Sr: 'Jr' };
const NEXT_YEAR: Record<ClassYear, ClassYear> = { Fr: 'So', So: 'Jr', Jr: 'Sr', Sr: 'Sr' };

/** `classYear` is last season's class (shown and kept on the draft board); `rosterYear` is the class the roster holds now. */
export function declareCandidates(state: DraftBoardState): { playerId: string; teamId: string; position: Position; classYear: ClassYear; rosterYear: ClassYear; rating: number | null }[] {
  const onBoard = new Set([...state.board.recruits, ...state.board.portal].map(p => p.playerId));
  const out: ReturnType<typeof declareCandidates> = [];
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    for (const e of entries) {
      if (!e.playerId || !e.classYear || e.classYear === 'Fr') continue;
      if (state.players.players[e.playerId]?.name == null || onBoard.has(e.playerId)) continue;
      out.push({ playerId: e.playerId, teamId, position: e.position, classYear: LAST_YEAR[e.classYear], rosterYear: e.classYear, rating: e.rating });
    }
  }
  return out.sort((a, b) => school(state, a.teamId).localeCompare(school(state, b.teamId)) || POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));
}

/** The age in the draft year of a player who was in this class last season (a Fr turns 19). */
const EARLY_AGE: Record<ClassYear, number> = { Fr: 19, So: 20, Jr: 21, Sr: 21 };

export function declare(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult {
  const started = draftBoardProblem(state.draft);
  if (started) return fail(started);
  const name = collegeName(state.players, playerId);
  const c = declareCandidates(state).find(x => x.playerId === playerId);
  if (!c) return fail(`${name} can't declare`);
  const entries = state.rosters.teams[c.teamId];
  const index = entries.findIndex(e => e.playerId === playerId);
  const prospect: DraftProspect = {
    playerId, position: c.position, college: c.teamId, classYear: c.classYear, senior: false,
    collegeRating: c.rating, stars: entries[index].stars ?? null, fbaRating: null,
  };
  const rosters = withTeam(state.rosters, c.teamId, entries.map((e, i) => (i === index ? collegeHole(e.position) : e)));
  // An early entrant with no birth season is dated from the class he was in last season: Fr 19, So 20, Jr 21 in the draft year.
  const person = state.players.players[playerId];
  const players: PlayersFile | null = person.birthSeason === null
    ? { ...state.players, players: { ...state.players.players, [playerId]: { ...person, birthSeason: state.season - EARLY_AGE[c.classYear] } } }
    : null;
  const tx = appendTx(state.collegeTx, ctx, 'declare', [c.teamId], [`${name} (${c.classYear} ${c.position}, ${school(state, c.teamId)}) declares for the S${state.season} draft`]);
  return {
    ok: true,
    writes: [
      { path: draftPath(state.season), doc: { ...state.draft, prospects: [...state.draft.prospects, prospect] } },
      { path: rostersPath(state.season), doc: rosters },
      { path: collegeTxPath(state.season), doc: tx },
      ...(players ? [{ path: 'players.json', doc: players }] : []),
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
  playerId: p.playerId, position: p.position, classYear: NEXT_YEAR[p.classYear], rating: p.collegeRating, stars: p.stars,
  projections: {}, committedTo: null, fromTeam: p.college,
});

export function backToSchool(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult {
  const r = leave(state, playerId, 'go back to school');
  if (typeof r === 'string') return fail(r);
  const { p, name, draft } = r;
  const entries = state.rosters.teams[p.college] ?? [];
  const index = entries.findIndex(e => e.playerId === null && e.position === p.position);
  if (index >= 0) {
    const entry: RosterEntry = { playerId, position: p.position, rating: p.collegeRating, age: null, points: 0, stars: p.stars, classYear: NEXT_YEAR[p.classYear] };
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

/** A rostered player (the same list that can declare) goes straight into the transfer portal without declaring for the draft. */
export function enterPortal(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult {
  const started = draftBoardProblem(state.draft);
  if (started) return fail(started);
  const name = collegeName(state.players, playerId);
  const c = declareCandidates(state).find(x => x.playerId === playerId);
  if (!c) return fail(`${name} can't enter the portal from here`);
  const entries = state.rosters.teams[c.teamId];
  const index = entries.findIndex(e => e.playerId === playerId);
  const entry = entries[index];
  const rosters = withTeam(state.rosters, c.teamId, entries.map((e, i) => (i === index ? collegeHole(e.position) : e)));
  const portalPlayer: PortalPlayer = {
    playerId, position: c.position, classYear: c.rosterYear, rating: c.rating, stars: entry.stars ?? null,
    projections: {}, committedTo: null, fromTeam: c.teamId,
  };
  const board = { ...state.board, portal: [...state.board.portal, portalPlayer] };
  const line = `${name} (${c.classYear} ${c.position}${ratingNote(c.rating)}) leaves ${school(state, c.teamId)} and enters the transfer portal`;
  const tx = appendTx(state.collegeTx, ctx, 'portal', [c.teamId], [line]);
  return {
    ok: true,
    writes: [
      { path: rostersPath(state.season), doc: rosters },
      { path: boardPath(state.season - 1), doc: board },
      { path: collegeTxPath(state.season), doc: tx },
    ],
    label: `${name} enters the transfer portal`,
  };
}

/**
 * Moves a prospect one place up (-1) or down (1) in the rankings by swapping with the neighbour in that direction (with `visible`, the nearest
 * prospect it accepts, for a position view) and saves the whole ranking in the draft as the commissioner's own order.
 */
export function moveProspectRank(state: DraftBoardState, playerId: string, delta: -1 | 1, visible: (playerId: string) => boolean = () => true): WritesResult {
  const started = draftBoardProblem(state.draft);
  if (started) return fail(started);
  const name = collegeName(state.players, playerId);
  const order = rankedProspects(boardOrder(state), state.draft.rankOrder).map(p => p.playerId);
  const i = order.indexOf(playerId);
  if (i < 0) return fail(`${name} isn't on the draft board`);
  let j = i + delta;
  while (j >= 0 && j < order.length && !visible(order[j])) j += delta;
  if (j < 0 || j >= order.length) return fail(`${name} is already at the ${delta < 0 ? 'top' : 'bottom'} of the rankings`);
  [order[i], order[j]] = [order[j], order[i]];
  return {
    ok: true,
    writes: [{ path: draftPath(state.season), doc: { ...state.draft, rankOrder: order } }],
    label: `${name} moves ${delta < 0 ? 'up' : 'down'} the rankings`,
  };
}

/**
 * The prospects by college rating plus the class boost (`classBoost`: a prospect who was a Fr last season +4, So +2, Jr +1, Sr 0), a missing
 * rating last, then by name. Prospects have no FBA rating on the board: the draft class is rated after the draft.
 */
export function boardOrder(state: DraftBoardState): DraftProspect[] {
  const desc = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a);
  return [...state.draft.prospects].sort((a, b) =>
    desc(boosted(a.collegeRating, a.classYear), boosted(b.collegeRating, b.classYear))
    || collegeName(state.players, a.playerId).localeCompare(collegeName(state.players, b.playerId)));
}
