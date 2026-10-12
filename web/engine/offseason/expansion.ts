import { capProblem, normalizeRoster, payroll } from '../roster/rules';
import { appendTx, docPath, findOnRoster, withTeam, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import { markStepDone } from '../shared/calendar';
import { EXPANSION_PICKS_EACH, MAX_PROTECTED, expansionDraftStepId } from '../shared/expansion';
import { teamsJoining } from '../shared/teams';
import type {
  CalendarFile, DraftHistoryDraft, DraftHistoryFile, ExpansionFile, PlayersFile, Position, RostersFile, TeamsFile, TransactionsFile,
} from '../shared/types';

export const expansionPath = (season: number) => `leagues/fba/S${season}/expansion.json`;
const HISTORY_PATH = 'leagues/fba/draftHistory.json';

export interface ExpansionState {
  season: number;
  calendar: CalendarFile;
  /** leagues/fba/teams.json */
  teams: TeamsFile;
  /** This season's FBA rosters. */
  fba: RostersFile;
  players: PlayersFile;
  expansion: ExpansionFile | null;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
  /** leagues/fba/draftHistory.json */
  history: DraftHistoryFile;
}

export interface Exposed {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number | null;
  age: number | null;
  contractAmount: number | null;
  contractEnd: number | null;
}

/** The pick order: a snake over `each` rounds. */
export function expansionOrder(teamIds: string[], each: number = EXPANSION_PICKS_EACH): string[] {
  const out: string[] = [];
  for (let r = 0; r < each; r++) out.push(...(r % 2 === 0 ? teamIds : [...teamIds].reverse()));
  return out;
}

const teamName = (state: ExpansionState, teamId: string) => state.teams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
const playerName = (state: ExpansionState, playerId: string) => state.players.players[playerId]?.name ?? playerId;
const joiningIds = (state: ExpansionState) => teamsJoining(state.teams, state.season).map(t => t.teamId);
const existingTeamIds = (state: ExpansionState) => {
  const joining = new Set(joiningIds(state));
  return Object.keys(state.fba.teams).filter(id => !joining.has(id));
};

/** The expansion team on the clock, or null when the order is used up. */
export function onTheClock(file: ExpansionFile): string | null {
  return file.order[file.picks.length] ?? null;
}

/** Players the expansion teams may take: not protected, not restricted, and not from a team that has already lost a player. */
export function exposedPlayers(state: ExpansionState): Exposed[] {
  const file = state.expansion;
  if (!file) return [];
  const out: Exposed[] = [];
  for (const teamId of existingTeamIds(state)) {
    if (file.picks.some(p => p.fromTeamId === teamId)) continue;
    const protectedIds = new Set(file.protections[teamId] ?? []);
    for (const e of state.fba.teams[teamId] ?? []) {
      if (e.playerId === null || e.restricted === true || protectedIds.has(e.playerId)) continue;
      out.push({
        playerId: e.playerId, teamId, position: e.position, rating: e.rating, age: e.age,
        contractAmount: e.contractAmount ?? null, contractEnd: e.contractEnd ?? null,
      });
    }
  }
  return out;
}

const write = (state: ExpansionState, doc: ExpansionFile) => ({ path: expansionPath(state.season), doc });

export function startExpansion(state: ExpansionState, ctx: MoveContext): WritesResult {
  const n = state.season;
  const problems: string[] = [];
  const step = calendarProblem(state.calendar, expansionDraftStepId(n), 'The expansion draft starts');
  if (step) problems.push(step);
  const joining = joiningIds(state);
  if (joining.length === 0) problems.push(`No team joins in S${n}`);
  if (state.expansion) problems.push('The expansion draft has already started');
  if (problems.length) return { ok: false, problems };
  const order = expansionOrder(joining);
  const doc: ExpansionFile = { league: 'fba', season: n, phase: 'protect', protections: {}, order, picks: [] };
  return {
    ok: true,
    writes: [
      write(state, doc),
      { path: docPath('fbaTx', n), doc: appendTx(state.tx, ctx, 'expansion', joining, [`The S${n} expansion draft starts: ${order.length} picks`]) },
    ],
    label: `Start the S${n} expansion draft`,
  };
}

export function setProtections(state: ExpansionState, teamId: string, playerIds: string[], ctx: MoveContext): WritesResult {
  void ctx;
  const file = state.expansion;
  if (!file) return { ok: false, problems: ["The expansion draft hasn't started"] };
  if (file.phase !== 'protect') return { ok: false, problems: ['Protections are locked'] };
  if (!existingTeamIds(state).includes(teamId)) return { ok: false, problems: [`${teamName(state, teamId)} isn't an existing team`] };
  const problems: string[] = [];
  const roster = state.fba.teams[teamId] ?? [];
  // A player protected earlier who has since left the team (traded, released) is dropped, not counted.
  const before = new Set(file.protections[teamId] ?? []);
  playerIds = playerIds.filter(id => !(before.has(id) && !roster.some(e => e.playerId === id)));
  if (playerIds.length > MAX_PROTECTED) problems.push(`A team protects at most ${MAX_PROTECTED} players`);
  if (new Set(playerIds).size !== playerIds.length) problems.push('A player is listed twice');
  for (const id of new Set(playerIds)) {
    const entry = roster.find(e => e.playerId === id);
    if (!entry) problems.push(`${playerName(state, id)} isn't on ${teamName(state, teamId)}`);
    else if (entry.restricted === true) problems.push(`${playerName(state, id)} has a restricted contract and is protected already`);
  }
  if (problems.length) return { ok: false, problems };
  const protections = { ...file.protections };
  if (playerIds.length === 0) delete protections[teamId];
  else protections[teamId] = [...playerIds];
  return {
    ok: true,
    writes: [write(state, { ...file, protections })],
    label: `Protect ${playerIds.length} for ${teamName(state, teamId)}`,
  };
}

/**
 * Whether the picks still to be made can all be legal (position held once, payroll under the cap, one player per donor team):
 * a backtracking search over the pick order, remembering the states that failed.
 */
function feasibleDraft(state: ExpansionState): boolean {
  const file = state.expansion!;
  const exposed = exposedPlayers(state).map(e => {
    const entry = state.fba.teams[e.teamId]?.find(x => x.playerId === e.playerId);
    return { teamId: e.teamId, position: e.position, amount: entry ? payroll([entry], state.season) : 0 };
  });
  const held = new Map<string, { positions: Set<Position>; pay: number }>();
  for (const id of new Set(file.order)) {
    const roster = state.fba.teams[id] ?? [];
    held.set(id, {
      positions: new Set(roster.filter(e => e.playerId !== null).map(e => e.position)),
      pay: payroll(roster, state.season),
    });
  }
  const failed = new Set<string>();
  const used = new Set<string>();
  const go = (i: number): boolean => {
    if (i >= file.order.length) return true;
    const key = `${i}|${[...used].sort().join(',')}|${[...held.entries()].map(([t, h]) => `${t}:${[...h.positions].sort().join('')}:${h.pay}`).join(';')}`;
    if (failed.has(key)) return false;
    const h = held.get(file.order[i])!;
    const tried = new Set<string>();
    for (const e of exposed) {
      if (used.has(e.teamId) || h.positions.has(e.position) || capProblem(h.pay + e.amount)) continue;
      const sig = `${e.teamId}:${e.position}:${e.amount}`;
      if (tried.has(sig)) continue;
      tried.add(sig);
      used.add(e.teamId);
      h.positions.add(e.position);
      h.pay += e.amount;
      const ok = go(i + 1);
      h.pay -= e.amount;
      h.positions.delete(e.position);
      used.delete(e.teamId);
      if (ok) return true;
    }
    failed.add(key);
    return false;
  };
  return go(file.picks.length);
}

export function lockProtections(state: ExpansionState, ctx: MoveContext): WritesResult {
  void ctx;
  const file = state.expansion;
  if (!file) return { ok: false, problems: ["The expansion draft hasn't started"] };
  if (file.phase !== 'protect') return { ok: false, problems: ['Protections are locked'] };
  const donors = new Set(exposedPlayers(state).map(e => e.teamId)).size;
  if (donors < file.order.length) {
    return {
      ok: false,
      problems: [`Only ${donors} ${donors === 1 ? 'team has' : 'teams have'} an exposed player; the draft needs ${file.order.length}. Lower some protections`],
    };
  }
  if (!feasibleDraft(state)) {
    return {
      ok: false,
      problems: [`No legal sequence of ${file.order.length} picks exists (one position per team, payroll under the cap, one player per team). Lower some protections`],
    };
  }
  return { ok: true, writes: [write(state, { ...file, phase: 'draft' })], label: 'Lock the protections' };
}

/** Back to the protect phase, allowed only until the first pick is made. */
export function unlockProtections(state: ExpansionState, ctx: MoveContext): WritesResult {
  void ctx;
  const file = state.expansion;
  if (!file) return { ok: false, problems: ["The expansion draft hasn't started"] };
  if (file.phase === 'protect') return { ok: false, problems: ['Protections are not locked'] };
  if (file.phase === 'done' || file.picks.length > 0) return { ok: false, problems: ['Protections cannot be unlocked once a pick has been made'] };
  return { ok: true, writes: [write(state, { ...file, phase: 'protect' })], label: 'Unlock the protections' };
}

/** Why this pick is refused (empty = allowed). */
export function pickProblems(state: ExpansionState, playerId: string): string[] {
  const file = state.expansion;
  if (!file) return ["The expansion draft hasn't started"];
  if (file.phase === 'protect') return ["The draft isn't open"];
  const clock = onTheClock(file);
  if (file.phase === 'done' || clock === null) return ['The expansion draft is finished'];
  const name = playerName(state, playerId);
  const exposed = exposedPlayers(state).find(e => e.playerId === playerId);
  if (!exposed) return [`${name} isn't available: protected, restricted or his team has already lost a player`];
  const roster = state.fba.teams[clock] ?? [];
  const out: string[] = [];
  if (roster.some(e => e.playerId !== null && e.position === exposed.position)) {
    out.push(`${teamName(state, clock)} already has a ${exposed.position}`);
  }
  const entry = state.fba.teams[exposed.teamId]?.find(e => e.playerId === playerId);
  const cap = capProblem(payroll(roster, state.season) + (entry ? payroll([entry], state.season) : 0));
  if (cap) out.push(cap);
  return out;
}

export function expansionPick(state: ExpansionState, playerId: string, ctx: MoveContext): WritesResult {
  const n = state.season;
  const step = calendarProblem(state.calendar, expansionDraftStepId(n), 'The expansion draft is held');
  if (step) return { ok: false, problems: [step] };
  const problems = pickProblems(state, playerId);
  if (problems.length) return { ok: false, problems };
  const file = state.expansion!;
  const clock = onTheClock(file)!;
  const found = findOnRoster(state.fba, playerId)!;
  const donorId = found.teamId;
  const moved = { ...found.entry };
  const donor = normalizeRoster((state.fba.teams[donorId] ?? []).filter(e => e.playerId !== playerId), 'fba');
  const taker = normalizeRoster([...(state.fba.teams[clock] ?? []).filter(e => e.playerId !== null), moved], 'fba');
  const k = file.picks.length + 1;
  const next: ExpansionFile = {
    ...file,
    picks: [...file.picks, { n: k, teamId: clock, fromTeamId: donorId, playerId, position: moved.position }],
  };
  const name = playerName(state, playerId);
  const line = `S${n} Expansion Draft #${k}: ${teamName(state, clock)} selects ${name} (${moved.position}, from ${teamName(state, donorId)})`;
  const rosters = withTeam(withTeam(state.fba, donorId, donor), clock, taker);
  return {
    ok: true,
    writes: [
      write(state, next),
      { path: docPath('fba', n), doc: rosters },
      { path: docPath('fbaTx', n), doc: appendTx(state.tx, ctx, 'expansion', [clock, donorId], [line]) },
    ],
    label: `#${k}: ${teamName(state, clock)} selects ${name}`,
  };
}

export function finishExpansion(state: ExpansionState, ctx: MoveContext): WritesResult {
  const n = state.season;
  const step = calendarProblem(state.calendar, expansionDraftStepId(n), 'The expansion draft is finished');
  if (step) return { ok: false, problems: [step] };
  const file = state.expansion;
  if (!file) return { ok: false, problems: ["The expansion draft hasn't started"] };
  if (file.phase === 'done' || state.history.drafts.some(d => d.season === n && d.kind === 'expansion')) {
    return { ok: false, problems: ['The expansion draft is finished'] };
  }
  if (file.phase !== 'draft') return { ok: false, problems: ["The draft isn't open"] };
  const left = file.order.length - file.picks.length;
  if (left > 0) return { ok: false, problems: [`${left} ${left === 1 ? 'pick is' : 'picks are'} still to be made`] };

  const draft: DraftHistoryDraft = {
    season: n,
    kind: 'expansion',
    picks: file.picks.map(p => {
      const age = findOnRoster(state.fba, p.playerId)?.entry.age ?? null;
      return {
        pick: p.n, teamId: p.teamId, teamName: teamName(state, p.teamId), viaTeamId: null,
        name: playerName(state, p.playerId), playerId: p.playerId, pos: p.position,
        detail: age === null ? null : String(age), college: null,
      };
    }),
  };
  const drafts = [...state.history.drafts, draft].sort(
    (a, b) => a.season - b.season || (a.kind === b.kind ? 0 : a.kind === 'draft' ? -1 : 1),
  );
  const history: DraftHistoryFile = { ...state.history, drafts };
  return {
    ok: true,
    writes: [
      write(state, { ...file, phase: 'done' }),
      { path: HISTORY_PATH, doc: history },
      { path: 'calendar.json', doc: markStepDone(state.calendar, expansionDraftStepId(n)) },
      { path: docPath('fbaTx', n), doc: appendTx(state.tx, ctx, 'expansion', file.order.filter((t, i, a) => a.indexOf(t) === i), [`The S${n} expansion draft is finished`]) },
    ],
    label: `Finish the S${n} expansion draft`,
  };
}
