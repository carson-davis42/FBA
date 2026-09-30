import { collegeName } from '../college/state';
import { appendTx, docPath, withTeam, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import { markStepDone } from '../shared/calendar';
import type {
  CalendarFile, DraftFile, DraftPick, FreeAgent, FreeAgentsFile, LotteryFile, PlayersFile, RankingFile, RosterEntry, RostersFile, TeamsFile, TransactionsFile,
} from '../shared/types';
import { draftPath } from './adjustAge';

export const draftStepId = (season: number) => `s${season}-fba-draft`;

export interface FbaDraftState {
  season: number;
  calendar: CalendarFile;
  draft: DraftFile;
  /** The S{n} pro ratings reset. */
  ratings: RankingFile | null;
  /** The S{n−1} lottery, which set this draft's order. */
  lottery: LotteryFile | null;
  fba: RostersFile;
  freeAgents: FreeAgentsFile;
  players: PlayersFile;
  fbaTeams: TeamsFile;
  collegeTeams: TeamsFile;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
}

/** The rookie deal: $2 (contractEnd is the season after the draft), restricted. */
const ROOKIE_AMOUNT = 2;

const teamName = (state: FbaDraftState, teamId: string) => state.fbaTeams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
const schoolName = (state: FbaDraftState, teamId: string) => state.collegeTeams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
const ageOf = (state: FbaDraftState, playerId: string): number | null => {
  const born = state.players.players[playerId]?.birthSeason;
  return born === null || born === undefined ? null : state.season - born;
};
const emptyPicks = (draft: DraftFile) => draft.picks.filter(p => p.playerId === null);
const undrafted = (draft: DraftFile) => {
  const taken = new Set(draft.picks.flatMap(p => (p.playerId ? [p.playerId] : [])));
  return draft.prospects.filter(p => !taken.has(p.playerId));
};

export function startDraftProblems(state: FbaDraftState): string[] {
  const out: string[] = [];
  const step = calendarProblem(state.calendar, draftStepId(state.season), 'The draft starts');
  if (step) out.push(step);
  if (!state.ratings?.locked) out.push('Finish the pro ratings reset first');
  for (const p of state.draft.prospects) {
    if (p.fbaRating === null) out.push(`${collegeName(state.players, p.playerId)} has no FBA rating`);
  }
  if (!state.lottery?.locked) out.push(`The S${state.season - 1} draft lottery hasn't been drawn`);
  if (state.draft.started) out.push('The draft has already started');
  return out;
}

export function startDraft(state: FbaDraftState, ctx: MoveContext): WritesResult {
  const problems = startDraftProblems(state);
  if (problems.length) return { ok: false, problems };
  const n = state.season;
  const picks: DraftPick[] = [...state.lottery!.picks]
    .sort((a, b) => a.slot - b.slot)
    .map(p => ({ slot: p.slot, owner: p.owner, originalTeam: p.originalTeam, playerId: null }));
  const draft: DraftFile = { ...state.draft, started: true, picks };
  const line = `The S${n} draft starts: ${picks.length} picks, ${draft.prospects.length} prospects`;
  return {
    ok: true,
    writes: [
      { path: draftPath(n), doc: draft },
      { path: docPath('fbaTx', n), doc: appendTx(state.tx, ctx, 'drafted', [], [line]) },
    ],
    label: `Start the S${n} draft`,
  };
}

/** The first pick with no player, or null once every pick is made (or before the start). */
export function onTheClock(draft: DraftFile): DraftPick | null {
  return draft.picks.find(p => p.playerId === null) ?? null;
}

export function draftPick(state: FbaDraftState, playerId: string, ctx: MoveContext): WritesResult {
  const n = state.season;
  const { draft } = state;
  if (!draft.started) return { ok: false, problems: ["The draft hasn't started"] };
  if (draft.locked) return { ok: false, problems: ['The draft is finished'] };
  const prospect = draft.prospects.find(p => p.playerId === playerId);
  if (!prospect) return { ok: false, problems: [`${playerId} isn't a prospect`] };
  const name = collegeName(state.players, playerId);
  if (draft.picks.some(p => p.playerId === playerId)) return { ok: false, problems: [`${name} has already been drafted`] };
  const pick = onTheClock(draft);
  if (!pick) return { ok: false, problems: ['No pick is on the clock'] };

  const rookie: RosterEntry = {
    playerId, position: prospect.position, rating: prospect.fbaRating, age: ageOf(state, playerId), points: 0,
    contractEnd: n + 1, contractAmount: ROOKIE_AMOUNT, restricted: true,
  };
  const nextDraft: DraftFile = { ...draft, picks: draft.picks.map(p => (p.slot === pick.slot ? { ...p, playerId } : p)) };
  const team = teamName(state, pick.owner);
  const line = `S${n} Draft #${pick.slot}: ${team} selects ${name} (${prospect.position}, ${schoolName(state, prospect.college)})`;
  return {
    ok: true,
    writes: [
      { path: draftPath(n), doc: nextDraft },
      { path: docPath('fba', n), doc: withTeam(state.fba, pick.owner, [...(state.fba.teams[pick.owner] ?? []), rookie]) },
      { path: docPath('fbaTx', n), doc: appendTx(state.tx, ctx, 'drafted', [pick.owner], [line]) },
    ],
    label: `#${pick.slot}: ${team} selects ${name}`,
  };
}

export function finishDraftProblems(state: FbaDraftState): string[] {
  const { draft } = state;
  if (!draft.started) return ["The draft hasn't started"];
  if (draft.locked) return ['The draft is finished'];
  const left = emptyPicks(draft).length;
  if (left > 0 && undrafted(draft).length > 0) return [`${left} ${left === 1 ? 'pick is' : 'picks are'} still to be made`];
  return [];
}

export function finishDraft(state: FbaDraftState, ctx: MoveContext): WritesResult {
  const n = state.season;
  const step = calendarProblem(state.calendar, draftStepId(n), 'The draft is finished');
  if (step) return { ok: false, problems: [step] };
  const problems = finishDraftProblems(state);
  if (problems.length) return { ok: false, problems };
  const left = undrafted(state.draft);
  const agents: FreeAgent[] = left.map(p => ({
    playerId: p.playerId, position: p.position, age: ageOf(state, p.playerId), rating: p.fbaRating, rookie: true, note: 'Undrafted',
  }));
  const lines = [
    `The S${n} draft is finished: ${left.length} undrafted ${left.length === 1 ? 'prospect joins' : 'prospects join'} free agency`,
    ...emptyPicks(state.draft).map(p => `#${p.slot}: ${teamName(state, p.owner)} makes no selection`),
  ];
  return {
    ok: true,
    writes: [
      { path: draftPath(n), doc: { ...state.draft, locked: true } },
      { path: docPath('freeAgents', n), doc: { ...state.freeAgents, players: [...state.freeAgents.players, ...agents] } },
      { path: 'calendar.json', doc: markStepDone(state.calendar, draftStepId(n)) },
      { path: docPath('fbaTx', n), doc: appendTx(state.tx, ctx, 'drafted', [], lines) },
    ],
    label: `Finish the S${n} draft`,
  };
}
