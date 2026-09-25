import type { Position } from '../../engine/shared/types';

export interface SheetPlayer {
  name: string | null;
  position: Position;
  age: number | null;
  rating: number | null;
  contractEnd: number | null;
  contractAmount: number | null;
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
  readPlayer: (r: string[], position: Position) => SheetPlayer,
  splitCountry: boolean,
  stopAt?: (text: string) => boolean,
): SheetTeam[] {
  const teams: SheetTeam[] = [];
  let current: SheetTeam | null = null;
  for (const r of rows) {
    const text = cell(r, teamCol);
    if (!text || isHeader(text)) continue;
    if (stopAt && stopAt(text)) break;
    const pos = text.match(POS_CELL);
    if (pos) {
      if (!current) throw new Error(`Player row appears before any team: ${r.join(',')}`);
      current.players.push(readPlayer(r, pos[1] as Position));
      continue;
    }
    const m = splitCountry ? text.match(/^(.*?)\s*\((.+)\)$/) : null;
    current = { name: m ? m[1] : text, country: m ? m[2] : null, players: [] };
    teams.push(current);
  }
  return teams.filter(t => t.players.length > 0);
}

export function parseFbaRosterTab(rows: string[][]): SheetTeam[] {
  return parseRosterRows(rows, 2, t => t.startsWith('Position/Team'), (r, position) => {
    const name = cell(r, 4);
    if (name === 'X' || name === '') return { name: null, position, age: null, rating: null, contractEnd: null, contractAmount: null };
    return {
      name,
      position,
      age: numOrNull(cell(r, 5)),
      rating: numOrNull(cell(r, 6)),
      contractEnd: seasonOrNull(cell(r, 7)),
      contractAmount: numOrNull(cell(r, 8)),
    };
  }, false);
}

export function parseD2RosterTab(rows: string[][]): SheetTeam[] {
  return parseRosterRows(rows, 0, t => t.startsWith('Position/Team'), (r, position) => {
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
