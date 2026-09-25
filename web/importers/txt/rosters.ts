import type { ClassYear, Position } from '../../engine/shared/types';

export type RosterFormat = 'fba' | 'fbad2' | 'fbajc' | 'fbawc';

export interface TxtPlayer {
  name: string | null;
  position: Position;
  age: number | null;
  rating: number;
  points: number;
  contractLen: number | null;
  cost: number | null;
  stars: number | null;
  classYear: ClassYear | null;
}

export interface TxtTeam {
  name: string;
  abbr: string;
  group: string | null;
  players: TxtPlayer[];
}

const POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
const CLASSES = new Set(['Fr', 'So', 'Jr', 'Sr']);
const FIELD_COUNT: Record<RosterFormat, number> = { fba: 7, fbad2: 5, fbajc: 6, fbawc: 4 };

function optNum(s: string, line: string): number | null {
  if (s === 'X' || s === '') return null;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Expected a number but got "${s}" in "${line}"`);
  return n;
}

function reqNum(s: string, line: string): number {
  const n = optNum(s, line);
  if (n === null) throw new Error(`Missing required number in "${line}"`);
  return n;
}

function parsePlayer(line: string, format: RosterFormat): TxtPlayer {
  const f = line.split('/');
  if (f.length !== FIELD_COUNT[format]) {
    throw new Error(`Expected ${FIELD_COUNT[format]} fields for ${format} but got ${f.length} in "${line}"`);
  }
  if (!POSITIONS.has(f[1])) throw new Error(`Unknown position "${f[1]}" in "${line}"`);
  const p: TxtPlayer = {
    name: f[0] === 'X' ? null : f[0],
    position: f[1] as Position,
    age: null, rating: 0, points: 0, contractLen: null, cost: null, stars: null, classYear: null,
  };
  switch (format) {
    case 'fba':
      p.age = optNum(f[2], line);
      p.contractLen = optNum(f[3], line);
      p.cost = optNum(f[4], line);
      p.rating = reqNum(f[5], line);
      p.points = reqNum(f[6], line);
      break;
    case 'fbad2':
      p.age = optNum(f[2], line);
      p.rating = reqNum(f[3], line);
      p.points = reqNum(f[4], line);
      break;
    case 'fbajc': {
      const stars = f[2].match(/^(\d)\*$/);
      p.stars = stars ? Number(stars[1]) : null;
      if (!CLASSES.has(f[3])) throw new Error(`Unknown class year "${f[3]}" in "${line}"`);
      p.classYear = f[3] as ClassYear;
      p.rating = reqNum(f[4], line);
      p.points = reqNum(f[5], line);
      break;
    }
    case 'fbawc':
      p.age = optNum(f[2], line);
      p.rating = reqNum(f[3], line);
      break;
  }
  return p;
}

export function parseRosterTxt(text: string, format: RosterFormat): TxtTeam[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  let i = 0;
  const count = Number(lines[i++]);
  if (!Number.isInteger(count)) throw new Error(`Expected a team count on line 1 but got "${lines[0]}"`);
  const teams: TxtTeam[] = [];
  for (let t = 0; t < count; t++) {
    const headerLine = lines[i++];
    const header = headerLine?.split('/');
    if (!header || header.length < 2) throw new Error(`Bad team header for team ${t + 1}: "${headerLine}"`);
    const n = Number(lines[i++]);
    if (!Number.isInteger(n)) throw new Error(`Expected a player count after "${headerLine}"`);
    const players: TxtPlayer[] = [];
    for (let p = 0; p < n; p++) players.push(parsePlayer(lines[i++], format));
    teams.push({ name: header[0], abbr: header[1].toUpperCase(), group: header[2] ?? null, players });
  }
  return teams;
}
