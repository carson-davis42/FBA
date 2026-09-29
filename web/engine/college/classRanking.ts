import { rankingBlockers } from '../rank/ranking';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import { calendarProblem, type WritesResult } from '../season/moves';
import type { CalendarFile, PlayersFile, RankingFile, RankingRow, RecruitingFile, TransactionsFile } from '../shared/types';
import { boardPath, collegeName } from './state';

const MIN_CONSENSUS = 70;
const MAX_CONSENSUS = 100;
const MIN_RATING = 1;
const MAX_RATING = 99;
const FIVE_STARS = { min: 12, max: 13 };
const THREE_STARS = { min: 3, max: 5 };
const MIN_MIX_CLASS = 15;

/** leagues/fbajc/S{boardSeason}/classRanking.json: the ranking of the class on that board (it plays in boardSeason + 1). */
export const classRankingPath = (boardSeason: number) => `leagues/fbajc/S${boardSeason}/classRanking.json`;

/** Stars follow the consensus: 90+ 5, 80+ 4, 70+ 3. */
export const starsFor = (consensus: number): 3 | 4 | 5 | null => (consensus >= 90 ? 5 : consensus >= 80 ? 4 : consensus >= 70 ? 3 : null);

/** The suggested consensus for rank k (1-based): the consensus that held rank k in the previous class. */
export function consensusSuggestion(doc: RankingFile, k: number): number | null {
  return doc.consensusCurve?.[k - 1] ?? null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Sets or clears (null) a consensus, 70-100, rounded to 2 decimals. Anything else, or a locked doc, returns the same object. */
export function setConsensus(doc: RankingFile, playerId: string, value: number | null): RankingFile {
  if (doc.locked || !doc.rows.some(r => r.playerId === playerId)) return doc;
  const current = doc.consensus ?? {};
  if (value === null) {
    if (current[playerId] === undefined) return doc;
    const { [playerId]: _cleared, ...rest } = current;
    return { ...doc, consensus: rest };
  }
  if (!Number.isFinite(value)) return doc;
  const v = round2(value);
  if (v < MIN_CONSENSUS || v > MAX_CONSENSUS || current[playerId] === v) return doc;
  return { ...doc, consensus: { ...current, [playerId]: v } };
}

/** Fills missing R and consensus from the suggestions (never overwrites). */
export function applyClassSuggestions(doc: RankingFile): RankingFile {
  if (doc.locked) return doc;
  const ratings = { ...doc.ratings };
  const consensus = { ...(doc.consensus ?? {}) };
  let changed = false;
  doc.order.forEach((id, i) => {
    const r = doc.curve[i];
    if (ratings[id] === undefined && r !== undefined) {
      ratings[id] = r;
      changed = true;
    }
    const c = consensusSuggestion(doc, i + 1);
    if (consensus[id] === undefined && c !== null) {
      consensus[id] = c;
      changed = true;
    }
  });
  return changed ? { ...doc, ratings, consensus } : doc;
}

export interface ClassRankState {
  /** The board of the class being ranked (board season n, class of n + 1). */
  board: RecruitingFile;
  ranking: RankingFile | null;
  /** The previous class's ranking, for the suggestion curves. */
  prevRanking: RankingFile | null;
  players: PlayersFile;
  calendar: CalendarFile;
  /** This calendar season's FBAJC transactions. */
  tx: TransactionsFile;
  /** The calendar season. */
  season: number;
}

const fail = (problems: string[]): WritesResult => ({ ok: false, problems });

/** The previous class's finished ratings and consensus as high-to-low ladders; empty without a finished previous class. */
function curves(prev: RankingFile | null): { curve: number[]; consensusCurve: number[] } {
  if (!prev?.locked) return { curve: [], consensusCurve: [] };
  const desc = (a: number, b: number) => b - a;
  return {
    curve: Object.values(prev.ratings).map(v => Math.max(MIN_RATING, Math.min(MAX_RATING, v))).sort(desc),
    consensusCurve: Object.values(prev.consensus ?? {}).sort(desc),
  };
}

export function startClassRanking(state: ClassRankState): WritesResult {
  const board = state.board;
  if (state.ranking) return fail(['The class ranking has already started']);
  if (!board.created) return fail(["The class hasn't been created yet"]);
  if (!board.recruits.length) return fail(['The class has no recruits']);
  const rows: RankingRow[] = board.recruits.map(p => ({
    playerId: p.playerId, position: p.position, age: null, team: p.committedTo, prevRating: null, otherRating: null, stat: null,
  }));
  const ranking: RankingFile = {
    league: 'fbajc', season: board.season, kind: 'college-class', locked: false, rows, order: [], ratings: {}, consensus: {}, ...curves(state.prevRanking),
  };
  return { ok: true, writes: [{ path: classRankingPath(board.season), doc: ranking }], label: `Start S${board.classOf} class ranking` };
}

/** "94.0", "95.1", "94.25": at least one decimal, at most two. */
const fmt = (v: number) => {
  const s = String(round2(v));
  return s.includes('.') ? s : `${s}.0`;
};

const recruits = (n: number) => (n === 1 ? '1 recruit' : `${n} recruits`);

/** Why the class ranking can't be finished yet; empty when it can. */
export function classBlockers(state: ClassRankState): string[] {
  const doc = state.ranking;
  if (!doc) return ['Start the class ranking first'];
  if (doc.locked) return ['The class is already ranked'];
  const name = (id: string) => collegeName(state.players, id);
  const out = rankingBlockers(doc, name);
  const consensus = doc.consensus ?? {};
  const missing = doc.order.filter(id => consensus[id] === undefined).length;
  if (missing) out.push(missing === 1 ? '1 player still needs a consensus' : `${missing} players still need a consensus`);
  let lowest: { id: string; rank: number; value: number } | null = null;
  doc.order.forEach((id, i) => {
    const value = consensus[id];
    if (value === undefined) return;
    const cur = { id, rank: i + 1, value };
    if (lowest && value > lowest.value) {
      out.push(`#${cur.rank} ${name(id)} (${fmt(value)}) has a higher consensus than #${lowest.rank} ${name(lowest.id)} (${fmt(lowest.value)})`);
    } else lowest = cur;
  });
  if (doc.rows.length < MIN_MIX_CLASS) out.push(`The star mix needs at least ${MIN_MIX_CLASS} recruits`);
  else if (doc.rows.every(r => consensus[r.playerId] !== undefined)) {
    const count = (stars: number) => doc.rows.filter(r => starsFor(consensus[r.playerId]) === stars).length;
    const five = count(5);
    if (five < FIVE_STARS.min || five > FIVE_STARS.max) out.push(`The class has ${five} 5★ ${five === 1 ? 'recruit' : 'recruits'}; it needs ${FIVE_STARS.min}–${FIVE_STARS.max}`);
    const three = count(3);
    if (three < THREE_STARS.min || three > THREE_STARS.max) out.push(`The class has ${three} 3★ ${three === 1 ? 'recruit' : 'recruits'}; it needs ${THREE_STARS.min}–${THREE_STARS.max}`);
  }
  return out;
}

export function finishClassRanking(state: ClassRankState, ctx: MoveContext): WritesResult {
  const doc = state.ranking;
  if (!doc || doc.locked) return fail(classBlockers(state));
  const stepId = `rank-s${state.board.classOf}-class`;
  const stepProblem = calendarProblem(state.calendar, stepId, 'The class is ranked');
  if (stepProblem) return fail([stepProblem]);
  const blockers = classBlockers(state);
  if (blockers.length) return fail(blockers);
  const consensus = doc.consensus ?? {};
  const ranked = state.board.recruits.map(p => {
    const c = consensus[p.playerId];
    return c === undefined ? p : { ...p, rating: doc.ratings[p.playerId] ?? p.rating, consensus: c, stars: starsFor(c) };
  });
  const tx = appendTx(state.tx, ctx, 'class', [], [`S${state.board.classOf} class ranked: ${recruits(ranked.length)}`]);
  return {
    ok: true,
    writes: [
      { path: classRankingPath(state.board.season), doc: { ...doc, locked: true } },
      { path: boardPath(state.board.season), doc: { ...state.board, recruits: ranked } },
      { path: `leagues/fbajc/S${state.season}/transactions.json`, doc: tx },
      { path: 'calendar.json', doc: markStepDone(state.calendar, stepId) },
    ],
    label: `Finish S${state.board.classOf} class ranking`,
  };
}
