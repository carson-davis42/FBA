import { collegeName } from '../college/state';
import { appendTx, docPath, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import { markStepDone, rookieStepId } from '../shared/calendar';
import type { CalendarFile, DraftFile, DraftProspect, FreeAgent, FreeAgentsFile, PlayersFile, ReservePlayer, ReservesFile, RostersFile, TransactionsFile } from '../shared/types';
import { draftPath } from './adjustAge';
import { rankedProspects } from './prospectOutlook';

/** The lowest rating a rookie gets: nobody is rated below it, and everyone left unrated goes to the D2 draft pool. */
export const ROOKIE_MIN_RATING = 55;
const MAX_RATING = 99;

export interface RookieRatingsState {
  season: number;
  calendar: CalendarFile;
  /** The finished S{n} draft board; its `rookieRatings` holds the typed ratings until the step is finished. */
  draft: DraftFile;
  fba: RostersFile;
  freeAgents: FreeAgentsFile;
  /** The S{n} FBAD2 Reserves, which the unrated players join. */
  reserves: ReservesFile;
  players: PlayersFile;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
}

const name = (state: RookieRatingsState, id: string) => collegeName(state.players, id);
const ageOf = (state: RookieRatingsState, id: string): number | null => {
  const born = state.players.players[id]?.birthSeason;
  return born === null || born === undefined ? null : state.season - born;
};

/** The whole class in prospect-ranking order: by name for a stable start, then the ranking (score and the commissioner's own order). */
export function rookieOrder(draft: DraftFile, players: PlayersFile): DraftProspect[] {
  const byName = [...draft.prospects].sort((a, b) => collegeName(players, a.playerId).localeCompare(collegeName(players, b.playerId)));
  return rankedProspects(byName, draft.rankOrder);
}

const stepAndDraftProblem = (state: RookieRatingsState, verb: string): string | null =>
  calendarProblem(state.calendar, rookieStepId(state.season), verb) ?? (state.draft.locked ? null : 'The draft is not finished');

/** Saves one typed rating (whole, 55 to 99) in the draft document, or clears it with null. */
export function setRookieRating(state: RookieRatingsState, playerId: string, value: number | null): WritesResult {
  const step = stepAndDraftProblem(state, 'Rookies are rated');
  if (step) return { ok: false, problems: [step] };
  if (!state.draft.prospects.some(p => p.playerId === playerId)) return { ok: false, problems: [`${playerId} isn't a prospect`] };
  if (value !== null && (!Number.isInteger(value) || value < ROOKIE_MIN_RATING || value > MAX_RATING)) {
    return { ok: false, problems: [`Enter a whole number from ${ROOKIE_MIN_RATING} to ${MAX_RATING}`] };
  }
  const { [playerId]: _gone, ...rest } = state.draft.rookieRatings ?? {};
  const rookieRatings = value === null ? rest : { ...rest, [playerId]: value };
  const draft: DraftFile = { ...state.draft, rookieRatings };
  return { ok: true, writes: [{ path: draftPath(state.season), doc: draft }], label: value === null ? `${name(state, playerId)}: rating cleared` : `${name(state, playerId)}: rookie rating ${value}` };
}

/** Ratings go top down with no gap, and never rise. */
export function rookieBlockers(state: RookieRatingsState): string[] {
  const ratings = state.draft.rookieRatings ?? {};
  const out: string[] = [];
  let unrated: DraftProspect | null = null;
  let above: { p: DraftProspect; rating: number } | null = null;
  for (const p of rookieOrder(state.draft, state.players)) {
    const rating = ratings[p.playerId];
    if (rating === undefined) {
      unrated ??= p;
      continue;
    }
    if (unrated) out.push(`${name(state, p.playerId)} is rated, but ${name(state, unrated.playerId)}, ranked above, is not`);
    else if (above && rating > above.rating) out.push(`${name(state, p.playerId)}'s rating (${rating}) is higher than ${name(state, above.p.playerId)}'s (${above.rating})`);
    if (!unrated) above = { p, rating };
  }
  return out;
}

/**
 * Finishes the step. Rated drafted players keep their rating on the team that drafted them; rated undrafted players join free agency with it;
 * everyone left unrated (drafted or not) leaves any FBA roster and joins the D2 Reserves in rank order, never free agency.
 */
export function finishRookieRatings(state: RookieRatingsState, ctx: MoveContext): WritesResult {
  const n = state.season;
  const step = stepAndDraftProblem(state, 'Rookies are rated');
  if (step) return { ok: false, problems: [step] };
  const blockers = rookieBlockers(state);
  if (blockers.length) return { ok: false, problems: blockers };

  const ratings = state.draft.rookieRatings ?? {};
  const owner = new Map(state.draft.picks.flatMap(p => (p.playerId ? [[p.playerId, p.owner] as const] : [])));
  const order = rookieOrder(state.draft, state.players);
  const ratedIds = new Set(order.filter(p => ratings[p.playerId] !== undefined).map(p => p.playerId));
  const drafted = new Set(owner.keys());

  const teams = Object.fromEntries(Object.entries(state.fba.teams).map(([teamId, entries]) => [
    teamId,
    entries.flatMap(e => {
      if (!e.playerId || !drafted.has(e.playerId) || owner.get(e.playerId) !== teamId) return [e];
      return ratedIds.has(e.playerId) ? [{ ...e, rating: ratings[e.playerId] }] : [];
    }),
  ]));

  const agents: FreeAgent[] = order.filter(p => ratedIds.has(p.playerId) && !drafted.has(p.playerId)).map(p => ({
    playerId: p.playerId, position: p.position, age: ageOf(state, p.playerId), rating: ratings[p.playerId], rookie: true, note: 'Undrafted',
  }));
  const toReserves: ReservePlayer[] = order.filter(p => !ratedIds.has(p.playerId)).map(p => ({
    playerId: p.playerId, position: p.position, age: ageOf(state, p.playerId), rating: null, fromFba: true as const,
  }));
  const line = `The S${n} rookies are rated: ${ratedIds.size} rated (${agents.length} to free agency), ${toReserves.length} to the D2 draft pool`;
  return {
    ok: true,
    writes: [
      { path: docPath('fba', n), doc: { ...state.fba, teams } },
      { path: docPath('freeAgents', n), doc: { ...state.freeAgents, players: [...state.freeAgents.players, ...agents] } },
      { path: docPath('reserves', n), doc: { ...state.reserves, players: [...state.reserves.players, ...toReserves] } },
      { path: docPath('fbaTx', n), doc: appendTx(state.tx, ctx, 'drafted', [], [line]) },
      { path: 'calendar.json', doc: markStepDone(state.calendar, rookieStepId(n)) },
    ],
    label: `Finish the S${n} rookie ratings`,
  };
}
