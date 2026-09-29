import { POSITIONS } from '../roster/rules';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import type { ClassDraftRow, Position, Prospect, RecruitingFile } from '../shared/types';
import { collegeName, recruitingFail, type RecruitingDocKey, type RecruitingResult, type RecruitingState } from './state';

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

/** Create S{n+1} Class: a new player (born n − 18) and an uncommitted Freshman recruit per draft row. */
export function createClass(state: RecruitingState, ctx: MoveContext): RecruitingResult {
  const doc = state.recruiting;
  if (doc.locked) return recruitingFail([LOCKED]);
  if (doc.created) return recruitingFail(['The class has already been created']);
  if (!doc.classDraft.length) return recruitingFail(['Add at least one recruit first']);
  const blank = doc.classDraft.filter(r => !r.name.trim()).length;
  if (blank) return recruitingFail([blank === 1 ? '1 row needs a name' : `${blank} rows need a name`]);
  let nextId = state.players.nextId;
  const people = { ...state.players.players };
  const recruits: Prospect[] = doc.classDraft.map(r => {
    const id = `p${String(nextId++).padStart(5, '0')}`;
    people[id] = { id, name: r.name.trim(), birthSeason: state.season - 18 };
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
