import type { PickCondition, Position } from '../../engine/shared/types';

export interface SheetPlayer {
  name: string | null;
  position: Position;
  age: number | null;
  rating: number | null;
  contractEnd: number | null;
  contractAmount: number | null;
  restricted?: true;
}

export interface SheetTeam {
  name: string;
  country: string | null;
  players: SheetPlayer[];
}

export interface ParsedCalendarStep {
  label: string;
  sub: boolean;
}

export interface ParsedCalendar {
  season: number;
  steps: ParsedCalendarStep[];
  hereIndex: number;
}

const POS_CELL = /^\((PG|SG|SF|PF|C)\)$/;
const cell = (r: string[], i: number) => (r[i] ?? '').trim();

function numOrNull(s: string): number | null {
  if (s === '' || s === 'X') return null;
  const n = Number(s.replace(/^\$/, ''));
  if (Number.isNaN(n)) throw new Error(`Expected a number but got "${s}"`);
  return n;
}

function seasonOrNull(s: string): number | null {
  if (s === '' || s === 'X') return null;
  const m = s.match(/^S(\d+)$/);
  if (!m) throw new Error(`Expected a season like "S81" but got "${s}"`);
  return Number(m[1]);
}

function parseRosterRows(
  rows: string[][],
  teamCol: number,
  isHeader: (text: string) => boolean,
  readPlayer: (r: string[], position: Position, rowIndex: number) => SheetPlayer,
  splitCountry: boolean,
  stopAt?: (text: string) => boolean,
): SheetTeam[] {
  const teams: SheetTeam[] = [];
  let current: SheetTeam | null = null;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex];
    const text = cell(r, teamCol);
    if (!text || isHeader(text)) continue;
    if (stopAt && stopAt(text)) break;
    const pos = text.match(POS_CELL);
    if (pos) {
      if (!current) throw new Error(`Player row appears before any team: ${r.join(',')}`);
      current.players.push(readPlayer(r, pos[1] as Position, rowIndex));
      continue;
    }
    const m = splitCountry ? text.match(/^(.*?)\s*\((.+)\)$/) : null;
    current = { name: m ? m[1] : text, country: m ? m[2] : null, players: [] };
    teams.push(current);
  }
  return teams.filter(t => t.players.length > 0);
}

export function parseFbaRosterTab(rows: string[][], underlined: Set<string> = new Set()): SheetTeam[] {
  return parseRosterRows(rows, 2, t => t.startsWith('Position/Team'), (r, position, rowIndex) => {
    const name = cell(r, 4);
    if (name === 'X' || name === '') return { name: null, position, age: null, rating: null, contractEnd: null, contractAmount: null };
    const player: SheetPlayer = {
      name,
      position,
      age: numOrNull(cell(r, 5)),
      rating: numOrNull(cell(r, 6)),
      contractEnd: seasonOrNull(cell(r, 7)),
      contractAmount: numOrNull(cell(r, 8)),
    };
    if (underlined.has(`${rowIndex}:7`)) player.restricted = true;
    return player;
  }, false);
}

export function parseD2RosterTab(rows: string[][]): SheetTeam[] {
  return parseRosterRows(rows, 0, t => t.startsWith('Position/Team'), (r, position, _rowIndex) => {
    const name = cell(r, 1);
    if (name === 'X' || name === '') return { name: null, position, age: null, rating: null, contractEnd: null, contractAmount: null };
    return { name, position, age: numOrNull(cell(r, 2)), rating: numOrNull(cell(r, 3)), contractEnd: null, contractAmount: null };
  }, true, t => t.toLowerCase() === 'reserves');
}

export function parseCalendarTab(rows: string[][]): ParsedCalendar {
  let block: ParsedCalendar | null = null;
  let hereOnSkipped = false;
  for (const r of rows) {
    const c0 = cell(r, 0);
    const season = c0.match(/^S(\d+)$/);
    if (season) {
      if (block && block.hereIndex >= 0) return block;
      block = { season: Number(season[1]), steps: [], hereIndex: -1 };
      hereOnSkipped = false;
      continue;
    }
    if (!block) continue;
    const label = cell(r, 1);
    if (!label) continue;
    const here = cell(r, 2).includes('Here');
    if (label.toLowerCase() === 'none') {
      if (here) hereOnSkipped = true;
      continue;
    }
    block.steps.push({ label, sub: c0 === '*' });
    if (here || hereOnSkipped) {
      block.hereIndex = block.steps.length - 1;
      hereOnSkipped = false;
    }
  }
  if (block && block.hereIndex >= 0) return block;
  throw new Error('No "*Here*" marker found in the calendar tab');
}

export interface ParsedFreeAgent {
  name: string;
  position: Position;
  age: number | null;
  rating: number | null;
  note: string;
}

export function parseFreeAgentsTab(rows: string[][]): ParsedFreeAgent[] {
  const start = rows.findIndex(r => cell(r, 0) === 'Free Agents');
  if (start < 0) throw new Error('No "Free Agents" section found in the free agents tab');
  const out: ParsedFreeAgent[] = [];
  for (const r of rows.slice(start + 1)) {
    const name = cell(r, 0);
    if (name === 'Top D2') break;
    if (!name) continue;
    const position = cell(r, 1);
    if (!/^(PG|SG|SF|PF|C)$/.test(position)) throw new Error(`Free agent "${name}" has an unknown position "${position}"`);
    out.push({ name, position: position as Position, age: numOrNull(cell(r, 2)), rating: numOrNull(cell(r, 3)), note: cell(r, 4) });
  }
  return out;
}

export function parseD2ReservesTab(rows: string[][]): SheetPlayer[] {
  const start = rows.findIndex(r => cell(r, 0).toLowerCase() === 'reserves');
  if (start < 0) return [];
  const out: SheetPlayer[] = [];
  for (const r of rows.slice(start + 1)) {
    const pos = cell(r, 0).match(POS_CELL);
    const name = cell(r, 1);
    if (!pos || !name || name === 'X') continue;
    out.push({ name, position: pos[1] as Position, age: numOrNull(cell(r, 2)), rating: numOrNull(cell(r, 3)), contractEnd: null, contractAmount: null });
  }
  return out;
}

export interface ParsedPick {
  season: number;
  owner: string;
  originalTeam: string;
  originSeason: number;
  condition: PickCondition;
  originalCondition: PickCondition;
  priority: number | null;
}

function conditionFromText(text: string): PickCondition {
  if (!text) return { kind: 'none' };
  const top = text.match(/^Top (\d+) Protected$/i);
  if (top) return { kind: 'top', n: Number(top[1]) };
  if (/^Lottery Protected$/i.test(text)) return { kind: 'lottery' };
  return { kind: 'custom', text };
}

function originalFromText(text: string): PickCondition | null {
  const m = text.match(/^Originally (\d+)P$/i);
  if (m) return { kind: 'top', n: Number(m[1]) };
  if (/^Originally LP$/i.test(text)) return { kind: 'lottery' };
  return null;
}

export function parsePickRows(rows: string[][], season: number): ParsedPick[] {
  const out: ParsedPick[] = [];
  for (const r of rows) {
    const head = cell(r, 0);
    if (!head) continue;
    if (head === 'TEAM') break;
    const m = head.match(/^([A-Z]+)\(via ([A-Z]+)\)\(S(\d+)\)$/);
    if (!m) throw new Error(`S${season}: can't read pick row "${r.join(',')}"`);
    const condition = conditionFromText(cell(r, 1));
    const priority = cell(r, 3).match(/^priority (\d+)$/i);
    out.push({
      season,
      owner: m[1],
      originalTeam: m[2],
      originSeason: Number(m[3]),
      condition,
      originalCondition: originalFromText(cell(r, 2)) ?? condition,
      priority: priority ? Number(priority[1]) : null,
    });
  }
  return out;
}
