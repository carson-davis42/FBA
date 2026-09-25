import type { Champion } from '../../engine/shared/types';

export interface RawResult {
  gameNo: number;
  home: string;
  homePts: number;
  away: string;
  awayPts: number;
}

export interface Series {
  a: string;
  aWins: number;
  b: string;
  bWins: number;
}

export interface BracketOutcome {
  champion: string | null;
  runnerUp: string | null;
  host: string | null;
}

const trimmedLines = (text: string) => text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim());

export function parseFbaResults(text: string): RawResult[] {
  return trimmedLines(text)
    .filter(l => l.length > 0)
    .map(line => {
      const f = line.split(',');
      const nums = [f[0], f[2], f[4]].map(Number);
      if (f.length !== 5 || nums.some(n => !Number.isInteger(n))) throw new Error(`Results line is malformed: "${line}"`);
      return { gameNo: nums[0], home: f[1], homePts: nums[1], away: f[3], awayPts: nums[2] };
    });
}

export function parseSeriesLine(line: string): Series | null {
  const m = line.trim().match(/^(\d+)-(.+?) vs (.+)-(\d+)$/);
  if (!m) return null;
  return { a: m[2], aWins: Number(m[1]), b: m[3], bWins: Number(m[4]) };
}

function seriesChampion(title: string, s: Series, winsNeeded: number): Champion | null {
  if (s.aWins >= winsNeeded) return { title, champion: s.a, runnerUp: s.b, score: `${s.aWins}-${s.bWins}` };
  if (s.bWins >= winsNeeded) return { title, champion: s.b, runnerUp: s.a, score: `${s.bWins}-${s.aWins}` };
  return null;
}

export function parseFbaPlayoffs(text: string): Champion | null {
  const lines = trimmedLines(text);
  const i = lines.indexOf('--FBA Finals--');
  if (i < 0) return null;
  const s = parseSeriesLine(lines[i + 1] ?? '');
  return s ? seriesChampion('FBA Champion', s, 4) : null;
}

export function parseD2Playoffs(text: string): Champion[] {
  const lines = trimmedLines(text);
  const start = lines.indexOf('--League Finals--');
  if (start < 0) return [];
  const out: Champion[] = [];
  for (let j = start + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l.startsWith('--') || l.startsWith('Next Games')) break;
    if (/^-[^-].*-$/.test(l)) {
      const s = parseSeriesLine(lines[j + 1] ?? '');
      const c = s ? seriesChampion(`${l.slice(1, -1)} Champion`, s, 4) : null;
      if (c) out.push(c);
      j++;
    }
  }
  return out;
}

export function parseBracketFile(text: string): BracketOutcome {
  const lines = trimmedLines(text);
  let host: string | null = null;
  for (const l of lines) {
    const m = l.match(/^--S\d+ World Cup (.+)--$/);
    if (m) { host = m[1]; break; }
  }
  const ci = lines.indexOf('--Champions--');
  const champion = ci >= 0 ? lines.slice(ci + 1).find(l => l.length > 0) ?? null : null;
  let runnerUp: string | null = null;
  const ni = lines.indexOf('--National Championship--');
  if (ni >= 0 && champion) {
    const m = (lines[ni + 1] ?? '').match(/^\(\d+\)(.+?) vs \(\d+\)(.+)$/);
    if (m) runnerUp = m[1] === champion ? m[2] : m[2] === champion ? m[1] : null;
  }
  return { champion, runnerUp, host };
}
