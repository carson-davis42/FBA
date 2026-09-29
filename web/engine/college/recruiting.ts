import { POSITIONS } from '../roster/rules';
import { appendTx, withTeam, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import { calendarProblem } from '../season/moves';
import type { ClassDraftRow, PortalPlayer, Position, Prospect, RecruitingFile, RosterEntry, RostersFile } from '../shared/types';
import { collegeHole } from './setup';
import { collegeName, playsThisSeason, recruitingFail, schoolName, type RecruitingDocKey, type RecruitingResult, type RecruitingState } from './state';

const LOCKED = 'Recruiting for this class is finished';
const LINE = /^(.+?)\s*[\t,]\s*(PG|SG|SF|PF|C)\s*$/i;

/** Reads a pasted class list: one "Name, POS" or "Name<Tab>POS" per line. Blank lines are skipped; lines that don't parse come back in `bad`. */
export function parseClassList(text: string): { rows: ClassDraftRow[]; bad: string[] } {
  const rows: ClassDraftRow[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(LINE);
    const name = m?.[1].trim();
    if (!m || !name) bad.push(line);
    else rows.push({ name, position: m[2].toUpperCase() as Position });
  }
  return { rows, bad };
}

const draftOpen = (doc: RecruitingFile) => !doc.locked && !doc.created;

export function addDraftRow(doc: RecruitingFile, row: ClassDraftRow): RecruitingFile {
  return draftOpen(doc) ? { ...doc, classDraft: [...doc.classDraft, row] } : doc;
}

export function appendDraftRows(doc: RecruitingFile, rows: ClassDraftRow[]): RecruitingFile {
  return draftOpen(doc) && rows.length ? { ...doc, classDraft: [...doc.classDraft, ...rows] } : doc;
}

export function editDraftRow(doc: RecruitingFile, index: number, patch: Partial<ClassDraftRow>): RecruitingFile {
  if (!draftOpen(doc) || !doc.classDraft[index]) return doc;
  return { ...doc, classDraft: doc.classDraft.map((r, i) => (i === index ? { ...r, ...patch } : r)) };
}

export function removeDraftRow(doc: RecruitingFile, index: number): RecruitingFile {
  if (!draftOpen(doc) || !doc.classDraft[index]) return doc;
  return { ...doc, classDraft: doc.classDraft.filter((_, i) => i !== index) };
}

export function draftCounts(doc: RecruitingFile): Record<Position, number> {
  const out = Object.fromEntries(POSITIONS.map(p => [p, 0])) as Record<Position, number>;
  for (const r of doc.classDraft) out[r.position]++;
  return out;
}

/** Create S{k} Class (k = `classOf`): a new player (born k − 18) and an uncommitted Freshman recruit per draft row. */
export function createClass(state: RecruitingState, ctx: MoveContext): RecruitingResult {
  const doc = state.recruiting;
  if (doc.locked) return recruitingFail([LOCKED]);
  if (doc.created) return recruitingFail(['The class has already been created']);
  const stepProblem = calendarProblem(state.calendar, `create-s${doc.classOf}-class`, 'The class is created');
  if (stepProblem) return recruitingFail([stepProblem]);
  if (!doc.classDraft.length) return recruitingFail(['Add at least one recruit first']);
  const blank = doc.classDraft.filter(r => !r.name.trim()).length;
  if (blank) return recruitingFail([blank === 1 ? '1 row needs a name' : `${blank} rows need a name`]);
  let nextId = state.players.nextId;
  const people = { ...state.players.players };
  const recruits: Prospect[] = doc.classDraft.map(r => {
    const id = `p${String(nextId++).padStart(5, '0')}`;
    people[id] = { id, name: r.name.trim(), birthSeason: doc.classOf - 18 };
    return { playerId: id, position: r.position, classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo: null };
  });
  const k = recruits.length;
  return {
    ok: true,
    state: {
      ...state,
      recruiting: { ...doc, classDraft: [], created: true, recruits },
      players: { nextId, players: people },
      tx: appendTx(state.tx, ctx, 'class', [], [`S${doc.classOf} class created: ${k} ${k === 1 ? 'recruit' : 'recruits'}`]),
      calendar: markStepDone(state.calendar, `create-s${doc.classOf}-class`),
    },
    changed: ['recruiting', 'players', 'tx', 'calendar'],
    label: `Create S${doc.classOf} class`,
  };
}

/** Renames a recruit (players.json) or changes their position (the board). Only while uncommitted. */
export function editRecruit(state: RecruitingState, playerId: string, patch: { name?: string; position?: Position }): RecruitingResult {
  const doc = state.recruiting;
  if (doc.locked) return recruitingFail([LOCKED]);
  const p = doc.recruits.find(r => r.playerId === playerId);
  if (!p) return recruitingFail([`${playerId} isn't in the class`]);
  const name = collegeName(state.players, playerId);
  if (p.committedTo) return recruitingFail([`${name} has committed; decommit them first`]);
  let next = state;
  const changed: RecruitingDocKey[] = [];
  if (patch.name !== undefined && patch.name.trim() !== name) {
    const newName = patch.name.trim();
    if (!newName) return recruitingFail(['Enter a name']);
    const player = state.players.players[playerId];
    next = { ...next, players: { ...next.players, players: { ...next.players.players, [playerId]: { ...player, name: newName } } } };
    changed.push('players');
  }
  if (patch.position !== undefined && patch.position !== p.position) {
    const position = patch.position;
    next = { ...next, recruiting: { ...doc, recruits: doc.recruits.map(r => (r.playerId === playerId ? { ...r, position } : r)) } };
    changed.push('recruiting');
  }
  if (!changed.length) return recruitingFail(['Nothing to change']);
  return { ok: true, state: next, changed, label: `Edit ${collegeName(next.players, playerId)}` };
}

/** Takes a recruit out of the class and out of players.json (nothing else refers to them). Only with no projections and no commitment. */
export function removeRecruit(state: RecruitingState, playerId: string): RecruitingResult {
  const doc = state.recruiting;
  if (doc.locked) return recruitingFail([LOCKED]);
  if (state.ranked) return recruitingFail(["The class is being ranked; recruits can't be removed"]);
  const p = doc.recruits.find(r => r.playerId === playerId);
  if (!p) return recruitingFail([`${playerId} isn't in the class`]);
  const name = collegeName(state.players, playerId);
  if (p.committedTo) return recruitingFail([`${name} has committed; decommit them first`]);
  if (Object.keys(p.projections).length) return recruitingFail([`Remove ${name}'s projections first`]);
  const { [playerId]: _removed, ...rest } = state.players.players;
  return {
    ok: true,
    state: {
      ...state,
      recruiting: { ...doc, recruits: doc.recruits.filter(r => r.playerId !== playerId) },
      players: { ...state.players, players: rest },
    },
    changed: ['recruiting', 'players'],
    label: `Remove ${name} from the class`,
  };
}

type OnBoard = { list: 'recruit'; p: Prospect } | { list: 'portal'; p: PortalPlayer };

function onBoard(doc: RecruitingFile, playerId: string): OnBoard | null {
  const recruit = doc.recruits.find(p => p.playerId === playerId);
  if (recruit) return { list: 'recruit', p: recruit };
  const transfer = doc.portal.find(p => p.playerId === playerId);
  return transfer ? { list: 'portal', p: transfer } : null;
}

/** Applies a change to one prospect, wherever they are on the board. */
function withProspect(doc: RecruitingFile, playerId: string, change: (p: Prospect) => Prospect): RecruitingFile {
  return {
    ...doc,
    recruits: doc.recruits.map(p => (p.playerId === playerId ? change(p) : p)),
    portal: doc.portal.map(p => (p.playerId === playerId ? { ...p, ...change(p) } : p)),
  };
}

/** True when this player is a recruit or transfer who committed this cycle. */
function committedThisCycle(doc: RecruitingFile, playerId: string): boolean {
  return [...doc.recruits, ...doc.portal].some(p => p.playerId === playerId && p.committedTo !== null);
}

type BoardCheck = { ok: true; found: OnBoard; name: string; school: string } | { ok: false; problems: string[] };

/** The checks every projection and commit shares: an open board, an uncommitted player on it, and a known school. */
function boardCheck(state: RecruitingState, playerId: string, teamId: string): BoardCheck {
  if (state.recruiting.locked) return { ok: false, problems: [LOCKED] };
  const found = onBoard(state.recruiting, playerId);
  if (!found) return { ok: false, problems: [`${playerId} isn't on the recruiting board`] };
  const name = collegeName(state.players, playerId);
  if (found.p.committedTo) return { ok: false, problems: [`${name} has already committed to ${schoolName(state, found.p.committedTo)}`] };
  if (!state.teams.teams.some(t => t.teamId === teamId)) return { ok: false, problems: [`Unknown school ${teamId}`] };
  return { ok: true, found, name, school: schoolName(state, teamId) };
}

export function addProjection(state: RecruitingState, playerId: string, teamId: string): RecruitingResult {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return check;
  const recruiting = withProspect(state.recruiting, playerId, p => ({ ...p, projections: { ...p.projections, [teamId]: (p.projections[teamId] ?? 0) + 1 } }));
  return { ok: true, state: { ...state, recruiting }, changed: ['recruiting'], label: `Project ${check.name} to ${check.school}` };
}

export function removeProjection(state: RecruitingState, playerId: string, teamId: string): RecruitingResult {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return check;
  const count = check.found.p.projections[teamId] ?? 0;
  if (!count) return recruitingFail([`${check.name} has no ${check.school} projection`]);
  const recruiting = withProspect(state.recruiting, playerId, p => {
    const { [teamId]: _last, ...rest } = p.projections;
    return { ...p, projections: count > 1 ? { ...p.projections, [teamId]: count - 1 } : rest };
  });
  return { ok: true, state: { ...state, recruiting }, changed: ['recruiting'], label: `Remove a ${check.school} projection for ${check.name}` };
}

/** Each projected school's share of the player's projections, most first. */
export function projectionShares(p: Prospect): { teamId: string; count: number; pct: number }[] {
  const total = Object.values(p.projections).reduce((a, b) => a + b, 0);
  return Object.entries(p.projections)
    .map(([teamId, count]) => ({ teamId, count, pct: Math.round((100 * count) / total) }))
    .sort((a, b) => b.count - a.count || a.teamId.localeCompare(b.teamId));
}

/** "67% TEX · 33% UH". */
export function formatShares(p: Prospect, abbr: (teamId: string) => string): string {
  return projectionShares(p).map(s => `${s.pct}% ${abbr(s.teamId)}`).join(' · ');
}

type Slot = { ok: true; index: number; displaced: RosterEntry | null; unnamed?: true } | { ok: false; problem: string };

/** The slot at the player's position on that school's roster, and who would have to leave it. */
function slotFor(state: RecruitingState, p: Prospect, teamId: string, school: string): Slot {
  const entries = state.rosters.teams[teamId];
  if (!entries) return { ok: false, problem: `${school} has no roster` };
  const index = entries.findIndex(e => e.position === p.position);
  if (index < 0) return { ok: false, problem: `${school} has no ${p.position} spot` };
  const holder = entries[index];
  if (holder.playerId === null) return { ok: true, index, displaced: null };
  // An unnamed (X) holder is simply replaced: nobody goes to the portal.
  if (state.players.players[holder.playerId]?.name == null) return { ok: true, index, displaced: null, unnamed: true };
  const holderName = collegeName(state.players, holder.playerId);
  if (committedThisCycle(state.recruiting, holder.playerId)) {
    return { ok: false, problem: `${school} already has ${holderName} committed at ${p.position}. Decommit them first` };
  }
  if (!holder.classYear) return { ok: false, problem: `${holderName} has no class year` };
  return { ok: true, index, displaced: holder };
}

/** For a next-class board: why this player can't take that school's spot at their position (someone else already committed there), or null. */
function sameSlotCommit(state: RecruitingState, p: Prospect, teamId: string): string | null {
  const other = [...state.recruiting.recruits, ...state.recruiting.portal].find(
    x => x.playerId !== p.playerId && x.committedTo === teamId && x.position === p.position,
  );
  if (!other) return null;
  return `${schoolName(state, teamId)} already has ${collegeName(state.players, other.playerId)} committed at ${p.position} for the S${state.recruiting.classOf} class. Decommit them first`;
}

const ratingNote =(rating: number | null) => (rating !== null ? `, ${rating}` : '');

/** What committing to this school would do: "Open spot", "Name (Jr, 78) will enter the portal", or why it's refused. */
export function commitPreview(state: RecruitingState, playerId: string, teamId: string): { ok: true; text: string } | { ok: false; text: string } {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return { ok: false, text: check.problems.join('; ') };
  const p = check.found.p;
  if (!playsThisSeason(state)) {
    const taken = sameSlotCommit(state, p, teamId);
    if (taken) return { ok: false, text: taken };
    return { ok: true, text: `Joins the S${state.recruiting.classOf} roster at Adjust Age` };
  }
  const slot = slotFor(state, p, teamId, check.school);
  if (!slot.ok) return { ok: false, text: slot.problem };
  if (slot.unnamed) return { ok: true, text: 'Replaces an unnamed player' };
  if (!slot.displaced) return { ok: true, text: 'Open spot' };
  const d = slot.displaced;
  return { ok: true, text: `${collegeName(state.players, d.playerId!)} (${d.classYear}${ratingNote(d.rating)}) will enter the portal` };
}

/**
 * The player commits: they take the slot at their position. A returning player in that slot enters the transfer portal
 * (D12); a player who committed this cycle can't be displaced (7a-3).
 */
export function commit(state: RecruitingState, playerId: string, teamId: string, ctx: MoveContext): RecruitingResult {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return check;
  const { found, name, school } = check;
  const p = found.p;
  const what = found.list === 'portal'
    ? `${p.classYear} ${p.position}, transfer from ${schoolName(state, found.p.fromTeam)}`
    : `${p.stars !== null ? `${p.stars}★ ` : ''}${p.position}`;
  const commitLine = `${name} (${what}) commits to ${school}`;
  if (!playsThisSeason(state)) {
    // The class plays next season: only the board and the log change; the rosters are built at Adjust Age.
    const taken = sameSlotCommit(state, p, teamId);
    if (taken) return recruitingFail([taken]);
    return {
      ok: true,
      state: {
        ...state,
        recruiting: withProspect(state.recruiting, playerId, x => ({ ...x, committedTo: teamId })),
        tx: appendTx(state.tx, ctx, 'commit', [teamId], [commitLine]),
      },
      changed: ['recruiting', 'tx'],
      label: `${name} commits to ${school}`,
    };
  }
  const slot = slotFor(state, p, teamId, school);
  if (!slot.ok) return recruitingFail([slot.problem]);
  let recruiting = state.recruiting;
  let tx = state.tx;
  if (slot.displaced) {
    const d = slot.displaced;
    const dId = d.playerId!;
    const transfer: PortalPlayer = {
      playerId: dId, position: d.position, classYear: d.classYear!, rating: d.rating, stars: d.stars ?? null, projections: {}, committedTo: null, fromTeam: teamId,
    };
    recruiting = { ...recruiting, portal: [...recruiting.portal, transfer] };
    tx = appendTx(tx, ctx, 'portal', [teamId], [
      `${collegeName(state.players, dId)} (${d.classYear} ${d.position}${ratingNote(d.rating)}) enters the transfer portal from ${school}`,
    ]);
  }
  const entry: RosterEntry = { playerId, position: p.position, rating: p.rating, age: null, points: 0, stars: p.stars, classYear: p.classYear };
  const rosters = withTeam(state.rosters, teamId, state.rosters.teams[teamId].map((e, i) => (i === slot.index ? entry : e)));
  recruiting = withProspect(recruiting, playerId, x => ({ ...x, committedTo: teamId }));
  tx = appendTx(tx, ctx, 'commit', [teamId], [commitLine]);
  return { ok: true, state: { ...state, recruiting, rosters, tx }, changed: ['recruiting', 'rosters', 'tx'], label: `${name} commits to ${school}` };
}

/** The player decommits: their slot becomes a hole; projections are kept; anyone they displaced stays in the portal (7a-2). */
export function decommit(state: RecruitingState, playerId: string, ctx: MoveContext): RecruitingResult {
  if (state.recruiting.locked) return recruitingFail([LOCKED]);
  const found = onBoard(state.recruiting, playerId);
  if (!found) return recruitingFail([`${playerId} isn't on the recruiting board`]);
  const name = collegeName(state.players, playerId);
  const teamId = found.p.committedTo;
  if (!teamId) return recruitingFail([`${name} hasn't committed`]);
  const school = schoolName(state, teamId);
  const line = `${name} decommits from ${school}`;
  const recruiting = withProspect(state.recruiting, playerId, x => ({ ...x, committedTo: null }));
  const tx = appendTx(state.tx, ctx, 'commit', [teamId], [line]);
  if (!playsThisSeason(state)) return { ok: true, state: { ...state, recruiting, tx }, changed: ['recruiting', 'tx'], label: line };
  const entries = state.rosters.teams[teamId] ?? [];
  const index = entries.findIndex(e => e.playerId === playerId);
  if (index < 0) return recruitingFail([`${name} isn't on ${school}'s roster`]);
  const rosters = withTeam(state.rosters, teamId, entries.map((e, i) => (i === index ? collegeHole(e.position) : e)));
  return { ok: true, state: { ...state, recruiting, rosters, tx }, changed: ['recruiting', 'rosters', 'tx'], label: line };
}

/** Recruits and portal players with no commitment yet. */
export function uncommitted(doc: RecruitingFile): { recruits: Prospect[]; portal: PortalPlayer[] } {
  return { recruits: doc.recruits.filter(p => !p.committedTo), portal: doc.portal.filter(p => !p.committedTo) };
}

/** Why the FBAJC step can't be marked done yet, or null (a missing board or roster doc adds no problem). */
export function fbajcGateProblem(board: RecruitingFile | null, rosters: RostersFile | null): string | null {
  const parts: string[] = [];
  if (board) {
    const open = uncommitted(board);
    const r = open.recruits.length;
    const m = open.portal.length;
    if (r || m) parts.push(`${r} ${r === 1 ? 'recruit' : 'recruits'} and ${m} ${m === 1 ? 'portal player' : 'portal players'} haven't committed yet`);
  }
  if (rosters) {
    const h = Object.values(rosters.teams).reduce((n, entries) => n + entries.filter(e => e.playerId === null).length, 0);
    if (h) parts.push(`${h} open ${h === 1 ? 'spot needs a walk-on' : 'spots need walk-ons'}`);
  }
  return parts.length ? parts.join('; ') : null;
}
