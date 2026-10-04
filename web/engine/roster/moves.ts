import type { FreeAgent, Position, RosterEntry } from '../shared/types';
import { lockProblem } from '../season/locks';
import {
  CAP, capProblem, contractEndFor, contractProblems, isExpired, MAX_AMOUNT, MAX_YEARS_RESIGN, normalizeRoster, payroll, POSITIONS, RETIRE_AGE, slotProblems,
  type ContractKind,
} from './rules';
import {
  appendTx, type DocKey, fail, findOnRoster, type MoveContext, type MoveResult, nameOf, type RosterState, withLeague, withTeam,
} from './state';

export interface SignInput {
  playerId: string;
  teamId: string;
  years: number;
  amount: number;
  rating?: number;
  conflict: 'keep' | 'release' | 'cut';
}

type Source =
  | { kind: 'fa'; fa: FreeAgent }
  | { kind: 'd2'; teamId: string; entry: RosterEntry }
  | { kind: 'expired'; teamId: string; entry: RosterEntry };

function locations(state: RosterState, playerId: string): string[] {
  const out: string[] = [];
  if (state.freeAgents.players.some(p => p.playerId === playerId)) out.push('free agents');
  const d2 = findOnRoster(state.d2, playerId);
  if (d2) out.push(`D2 ${d2.teamId}`);
  const fba = findOnRoster(state.fba, playerId);
  if (fba) out.push(`FBA ${fba.teamId}`);
  return out;
}

function findSource(state: RosterState, playerId: string): Source | null {
  const fa = state.freeAgents.players.find(p => p.playerId === playerId);
  if (fa) return { kind: 'fa', fa };
  const d2 = findOnRoster(state.d2, playerId);
  if (d2) return { kind: 'd2', teamId: d2.teamId, entry: d2.entry };
  const fba = findOnRoster(state.fba, playerId);
  if (fba && isExpired(fba.entry, state.season)) return { kind: 'expired', teamId: fba.teamId, entry: fba.entry };
  return null;
}

const toFreeAgent = (e: RosterEntry): FreeAgent => ({ playerId: e.playerId!, position: e.position, age: e.age, rating: e.rating, rookie: false, note: '' });

export function signPlayer(state: RosterState, input: SignInput, ctx: MoveContext): MoveResult {
  const locked = lockProblem(ctx.phase, 'fba', 'sign');
  if (locked) return fail([locked]);
  const { season } = state;
  if (state.freeAgents.locked) return fail(['Free agency is closed']);
  const team = state.fba.teams[input.teamId];
  if (!team) return fail([`Unknown FBA team ${input.teamId}`]);
  const src = findSource(state, input.playerId);
  if (!src) return fail(['That player is not available to sign']);
  const name = nameOf(state, input.playerId);
  const where = locations(state, input.playerId);
  if (where.length > 1) return fail([`${name} is listed in more than one place (${where.join(', ')}); fix the data first`]);
  const position: Position = src.kind === 'fa' ? src.fa.position : src.entry.position;
  const age = src.kind === 'fa' ? src.fa.age : src.entry.age;
  const resign = src.kind === 'expired' && src.teamId === input.teamId;
  if (src.kind === 'expired' && !resign && src.entry.restricted) return fail([`${name} is restricted: only ${src.teamId} can re-sign him`]);
  const kind: ContractKind = resign ? 'resign' : src.kind === 'fa' && src.fa.rookie ? 'rookie' : 'new';

  const problems = contractProblems({ years: input.years, amount: input.amount }, kind);
  const knownRating = src.kind === 'fa' ? src.fa.rating : src.kind === 'expired' ? src.entry.rating : null;
  const rating = input.rating ?? knownRating;
  if (src.kind === 'd2' && input.rating === undefined) problems.push('Enter his FBA rating (D2 ratings are on a different scale)');
  else if (rating === null) problems.push('Enter a rating for this player');
  else if (!Number.isInteger(rating) || rating < 1 || rating > 99) problems.push('Rating must be a whole number from 1 to 99');

  let entries = team.filter(e => e.playerId !== input.playerId);
  const occupant = entries.find(e => e.position === position && e.playerId !== null);
  const displaced = occupant && input.conflict !== 'keep' ? occupant : null;
  if (displaced) entries = entries.filter(e => e !== displaced);
  const end = contractEndFor(season, input.years);
  entries = normalizeRoster(
    [...entries, { playerId: input.playerId, position, rating: rating ?? null, age, points: 0, contractEnd: end, contractAmount: input.amount, restricted: kind === 'rookie' }],
    'fba',
  );
  const cap = capProblem(payroll(entries, season));
  if (cap) problems.push(cap);
  if (problems.length) return fail(problems);

  const changed = new Set<DocKey>(['fba', 'fbaTx']);
  let fba = withTeam(state.fba, input.teamId, entries);
  let { d2, freeAgents, d2Tx } = state;
  const lines = [`${resign ? 'Re-signed' : 'Signed'} ${position}-${name} (${input.years}/$${input.amount}, thru S${end})`];

  if (src.kind === 'fa') {
    freeAgents = { ...freeAgents, players: freeAgents.players.filter(p => p.playerId !== input.playerId) };
    changed.add('freeAgents');
  }
  if (src.kind === 'd2') {
    d2 = withTeam(d2, src.teamId, normalizeRoster(d2.teams[src.teamId].filter(e => e.playerId !== input.playerId), 'fbad2'));
    d2Tx = appendTx(d2Tx, ctx, 'signed', [src.teamId], [`${position}-${name} signed by ${input.teamId} (FBA)`]);
    changed.add('d2').add('d2Tx');
  }
  if (src.kind === 'expired' && !resign) {
    fba = withTeam(fba, src.teamId, normalizeRoster(fba.teams[src.teamId].filter(e => e.playerId !== input.playerId), 'fba'));
  }
  if (displaced) {
    freeAgents = { ...freeAgents, players: [...freeAgents.players, toFreeAgent(displaced)] };
    changed.add('freeAgents');
    lines.push(`${input.conflict === 'cut' ? 'Cut' : 'Released'} ${displaced.position}-${nameOf(state, displaced.playerId!)}`);
  }

  let fbaTx = appendTx(state.fbaTx, ctx, resign ? 'resigned' : 'signed', [input.teamId], lines);
  if (src.kind === 'expired' && !resign) {
    fbaTx = appendTx(fbaTx, ctx, 'released', [src.teamId], [`Released ${position}-${name} (contract ended)`]);
  }

  return {
    ok: true,
    state: { ...state, fba, d2, freeAgents, fbaTx, d2Tx },
    changed: [...changed],
    label: `${resign ? 'Re-sign' : 'Sign'} ${name} → ${input.teamId}`,
    warnings: slotProblems(input.teamId, entries).filter(p => !p.includes(': no ')),
  };
}

export interface ExtendInput {
  teamId: string;
  playerId: string;
  amount: number;
}

/** Extensions add one season and change salary immediately, regardless of the season phase. */
export function extendPlayer(state: RosterState, input: ExtendInput, ctx: MoveContext): MoveResult {
  if (state.fba.locked || state.fbaTx.locked) return fail(['This season is final (locked)']);
  const team = state.fba.teams[input.teamId];
  const before = team?.find(e => e.playerId === input.playerId && e.playerId !== null);
  if (!team || !before) return fail([`That player is not on ${input.teamId}`]);
  if (before.contractEnd == null || before.contractAmount == null || isExpired(before, state.season)) {
    return fail(['Only an active contract can be extended; re-sign an expired player instead']);
  }
  const end = before.contractEnd + 1;
  const years = end - state.season + 1;
  const problems: string[] = [];
  const player = state.players.players[input.playerId];
  const birth = player?.birthSeason;
  const age = birth == null ? before.age : state.season - birth;
  if (player?.retired) problems.push('A retired player cannot be extended');
  else if (age == null) problems.push('Set the player’s age before extending his contract so the retirement limit can be checked');
  else {
    const lastSeason = state.season + RETIRE_AGE - age;
    if (end > lastSeason) problems.push(`Contract cannot extend past S${lastSeason}, the player’s age-${RETIRE_AGE} season`);
  }
  if (!Number.isInteger(input.amount) || input.amount < 1) problems.push('Amount must be a whole number of dollars, at least $1');
  else {
    if (input.amount > MAX_AMOUNT) problems.push(`Amount can't exceed $${MAX_AMOUNT}`);
    if (input.amount < before.contractAmount - 1) problems.push('Pay can decrease by at most $1 per season extended');
    if (years > input.amount) problems.push(`Years can't exceed dollars (${years} years needs at least $${years})`);
  }
  const entries = team.map(e => e === before ? { ...e, contractEnd: end, contractAmount: input.amount } : e);
  const cap = capProblem(payroll(entries, state.season));
  if (cap) problems.push(cap);
  if (problems.length) return fail(problems);
  const name = nameOf(state, input.playerId);
  const tx = appendTx(state.fbaTx, ctx, 'extended', [input.teamId], [
    `Extended ${before.position}-${name}: contract end S${before.contractEnd}→S${end}, amount $${before.contractAmount}→$${input.amount} (${years}/$${input.amount})`,
  ]);
  return {
    ok: true,
    state: { ...state, fba: withTeam(state.fba, input.teamId, entries), fbaTx: tx },
    changed: ['fba', 'fbaTx'],
    label: `Extend ${name} (${input.teamId})`,
    warnings: [],
  };
}

export interface ReleaseInput {
  league: 'fba' | 'fbad2';
  teamId: string;
  playerId: string;
  kind: 'released' | 'cut';
}

export function releasePlayer(state: RosterState, input: ReleaseInput, ctx: MoveContext): MoveResult {
  const locked = lockProblem(ctx.phase, input.league, input.kind === 'cut' ? 'cut' : 'release');
  if (locked) return fail([locked]);
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const txKey = input.league === 'fba' ? 'fbaTx' : 'd2Tx';
  const team = state[key].teams[input.teamId];
  const entry = team?.find(e => e.playerId === input.playerId);
  if (!team || !entry) return fail([`That player is not on ${input.teamId}`]);

  const name = nameOf(state, input.playerId);
  const rosters = withTeam(state[key], input.teamId, normalizeRoster(team.filter(e => e !== entry), input.league));
  const changed: DocKey[] = [key, txKey];
  let { freeAgents, reserves } = state;
  if (input.league === 'fba' && !freeAgents.locked) {
    freeAgents = { ...freeAgents, players: [...freeAgents.players, toFreeAgent(entry)] };
    changed.push('freeAgents');
  } else {
    const rating = input.league === 'fbad2' ? entry.rating : null;
    reserves = { ...reserves, players: [...reserves.players, { playerId: input.playerId, position: entry.position, age: entry.age, rating }] };
    changed.push('reserves');
  }
  const verb = input.kind === 'cut' ? 'Cut' : 'Released';
  const tx = appendTx(state[txKey], ctx, input.kind, [input.teamId], [`${verb} ${entry.position}-${name}`]);
  return {
    ok: true,
    state: { ...withLeague(state, input.league, rosters, tx), freeAgents, reserves },
    changed,
    label: `${verb === 'Cut' ? 'Cut' : 'Release'} ${name} (${input.teamId})`,
    warnings: [],
  };
}

export type EditChanges = Partial<{
  rating: number | null;
  age: number | null;
  contractEnd: number | null;
  contractAmount: number | null;
  restricted: boolean;
}>;

export interface EditInput {
  league: 'fba' | 'fbad2';
  teamId: string;
  playerId: string;
  changes: EditChanges;
}

function applyEdit(state: RosterState, input: EditInput): { entries: RosterEntry[]; before: RosterEntry; after: RosterEntry } | null {
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const team = state[key].teams[input.teamId];
  const before = team?.find(e => e.playerId === input.playerId);
  if (!team || !before) return null;
  const after: RosterEntry = { ...before, ...input.changes };
  if (input.changes.restricted === false && before.restricted === undefined) delete after.restricted;
  return { entries: team.map(e => (e === before ? after : e)), before, after };
}

/** A missing `restricted` is equivalent to false, so diffing and display treat them the same. */
const restrictedValue = (v: boolean | undefined): boolean => v ?? false;

export function editWarnings(state: RosterState, input: EditInput): string[] {
  const applied = applyEdit(state, input);
  if (!applied || input.league !== 'fba') return [];
  const { after, entries } = applied;
  const w: string[] = [];
  if (after.contractAmount != null && after.contractAmount > MAX_AMOUNT) w.push(`Amount can't exceed $${MAX_AMOUNT}`);
  if (after.contractEnd != null && after.contractEnd - state.season + 1 > MAX_YEARS_RESIGN) w.push(`Contract runs more than ${MAX_YEARS_RESIGN} seasons`);
  if (after.contractEnd != null && after.contractAmount != null && after.contractEnd - state.season + 1 > after.contractAmount) w.push("Years exceed dollars");
  const total = payroll(entries, state.season);
  if (total > CAP) w.push(`Payroll would be $${total} (cap $${CAP})`);
  return w;
}

const FIELD_LABEL: Record<keyof EditChanges, string> = {
  rating: 'rating', age: 'age', contractEnd: 'contract end', contractAmount: 'amount', restricted: 'restricted',
};

function show(field: keyof EditChanges, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (field === 'contractEnd') return `S${v}`;
  if (field === 'contractAmount') return `$${v}`;
  return String(v);
}

export function editPlayer(state: RosterState, input: EditInput, ctx: MoveContext): MoveResult {
  const locked = lockProblem(ctx.phase, input.league, 'edit');
  if (locked) return fail([locked]);
  const applied = applyEdit(state, input);
  if (!applied) return fail([`That player is not on ${input.teamId}`]);
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const txKey = input.league === 'fba' ? 'fbaTx' : 'd2Tx';
  const name = nameOf(state, input.playerId);
  const changed = (f: keyof EditChanges): boolean =>
    f === 'restricted' ? restrictedValue(applied.before.restricted) !== restrictedValue(applied.after.restricted) : applied.before[f] !== applied.after[f];
  const diffs = (Object.keys(input.changes) as (keyof EditChanges)[])
    .filter(changed)
    .map(f => `${FIELD_LABEL[f]} ${show(f, applied.before[f])}→${show(f, applied.after[f])}`);
  const tx = appendTx(state[txKey], ctx, 'edit', [input.teamId], [`Edited ${applied.before.position}-${name}: ${diffs.join(', ') || 'no changes'}`]);
  return {
    ok: true,
    state: withLeague(state, input.league, withTeam(state[key], input.teamId, applied.entries), tx),
    changed: [key, txKey],
    label: `Edit ${name}`,
    warnings: editWarnings(state, input),
  };
}

export function freeAgencyBlockers(state: RosterState): string[] {
  const out: string[] = [];
  for (const [teamId, entries] of Object.entries(state.fba.teams)) {
    for (const pos of POSITIONS) {
      const players = entries.filter(e => e.position === pos && e.playerId !== null);
      if (players.length === 0) out.push(`${teamId}: no ${pos}`);
      if (players.length > 1) out.push(`${teamId}: ${players.length} players at ${pos}`);
      for (const e of players) {
        if (isExpired(e, state.season)) out.push(`${teamId}: ${pos}-${nameOf(state, e.playerId!)}'s contract expired (re-sign or release him)`);
      }
    }
    const cap = capProblem(payroll(entries, state.season));
    if (cap) out.push(`${teamId}: ${cap}`);
  }
  return out;
}

export function closeFreeAgency(state: RosterState, ctx: MoveContext): MoveResult {
  if (state.freeAgents.locked) return fail(['Free agency is already closed']);
  const blockers = freeAgencyBlockers(state);
  if (blockers.length) return fail(blockers);
  const moved = state.freeAgents.players;
  const reserves = {
    ...state.reserves,
    players: [
      ...state.reserves.players,
      ...moved.map(p => ({
        playerId: p.playerId, position: p.position, age: p.age, rating: null, fromFba: true as const,
        ...(p.rating !== null ? { fbaRating: p.rating } : {}),
      })),
    ],
  };
  const fbaTx = appendTx(state.fbaTx, ctx, 'fa-closed', [], [`Free agency closed: ${moved.length} unsigned players moved to D2 Reserves`]);
  return {
    ok: true,
    state: { ...state, freeAgents: { ...state.freeAgents, locked: true, players: [] }, reserves, fbaTx },
    changed: ['freeAgents', 'reserves', 'fbaTx'],
    label: 'Close free agency',
    warnings: [],
  };
}
