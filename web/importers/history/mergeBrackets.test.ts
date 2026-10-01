import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PastSeries, SummaryFile } from '../../engine/shared/types';
import type { BracketEntry } from './convertBrackets';
import { mergeBrackets, runBracketImport } from './mergeBrackets';

const side = (name: string, seed: number) => ({ name, record: null, seed });
const final: PastSeries = { id: 'R1-1', round: 1, home: side('Rome', 1), away: side('Sydney', 2), homeWins: 4, awayWins: 1, winner: 'home' };
const entry = (season: number, group?: BracketEntry['group']): BracketEntry => ({ season, group, rounds: 1, series: [final] });
const summary = (league: 'fbawc' | 'fbad2', season: number, over: Partial<SummaryFile> = {}): SummaryFile => ({ league, season, locked: true, host: null, champions: [], ...over });
const maps = (...s: SummaryFile[]) => new Map(s.map(x => [x.season, x]));

describe('mergeBrackets', () => {
  it('sets pastBracket for a World Cup entry', () => {
    const r = mergeBrackets('fbawc', [entry(10)], maps(summary('fbawc', 10)));
    expect(r.summaries[0].pastBracket).toEqual({ rounds: 1, series: [final] });
    expect(r.report).toEqual({ set: 1, unchanged: 0, missingSummary: [], replaced: [] });
  });
  it('adds grouped D2 entries to pastBrackets in group order', () => {
    const r = mergeBrackets('fbad2', [entry(76, 'PL'), entry(76, 'WL')], maps(summary('fbad2', 76, { pastBrackets: [{ group: 'WL', bracket: { rounds: 1, series: [] } }] })));
    expect(r.summaries[0].pastBrackets?.map(p => p.group)).toEqual(['PL', 'WL']);
    expect(r.summaries[0].pastBrackets?.[1].bracket.series).toEqual([final]);
  });
  it('sets pastBracket for a group-less D2 entry', () => {
    const r = mergeBrackets('fbad2', [entry(60)], maps(summary('fbad2', 60)));
    expect(r.summaries[0].pastBracket?.rounds).toBe(1);
  });
  it('counts a re-run as unchanged', () => {
    const first = mergeBrackets('fbad2', [entry(76, 'PL'), entry(60)], maps(summary('fbad2', 76), summary('fbad2', 60)));
    const again = mergeBrackets('fbad2', [entry(76, 'PL'), entry(60)], maps(...first.summaries));
    expect(again.report).toEqual({ set: 0, unchanged: 2, missingSummary: [], replaced: [] });
    expect(again.summaries).toEqual([]);
  });
  it('lists a missing season and never creates it', () => {
    const r = mergeBrackets('fbad2', [entry(54), entry(76, 'WL')], maps());
    expect(r.report.missingSummary).toEqual(['S54', 'S76 WL']);
    expect(r.summaries).toEqual([]);
  });
  it('throws when one D2 season mixes grouped and group-less entries', () => {
    expect(() => mergeBrackets('fbad2', [entry(76, 'PL'), entry(76)], maps(summary('fbad2', 76)))).toThrow(/S76/);
  });
  it('throws, naming the season, when an existing summary mixes with the incoming shape', () => {
    const b = { rounds: 1, series: [final] };
    expect(() => mergeBrackets('fbad2', [entry(76, 'PL')], maps(summary('fbad2', 76, { pastBracket: b })))).toThrow(/S76/);
    expect(() => mergeBrackets('fbad2', [entry(60)], maps(summary('fbad2', 60, { pastBrackets: [{ group: 'PL', bracket: b }] })))).toThrow(/S60/);
  });
  it('throws for a World Cup entry that carries a group', () => {
    expect(() => mergeBrackets('fbawc', [entry(10, 'PL')], maps(summary('fbawc', 10)))).toThrow(/S10/);
  });
  it('overwrites a different bracket and lists it as replaced', () => {
    const old = { rounds: 1, series: [{ ...final, homeWins: 4, awayWins: 3 }] };
    const r = mergeBrackets('fbawc', [entry(10)], maps(summary('fbawc', 10, { pastBracket: old })));
    expect(r.summaries[0].pastBracket?.series).toEqual([final]);
    expect(r.report).toEqual({ set: 1, unchanged: 0, missingSummary: [], replaced: ['S10'] });
  });
  it('keeps a live bracket', () => {
    const live = { seeds: [], series: [] };
    const r = mergeBrackets('fbawc', [entry(10)], maps(summary('fbawc', 10, { bracket: live })));
    expect(r.summaries[0].bracket).toEqual(live);
  });
});

describe('runBracketImport', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  it('writes changed summaries to a temp dir and is idempotent', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'brk-'));
    dirs.push(dir);
    for (const n of [10, 11]) {
      mkdirSync(path.join(dir, 'leagues', 'fbawc', `S${n}`), { recursive: true });
      writeFileSync(path.join(dir, 'leagues', 'fbawc', `S${n}`, 'summary.json'), JSON.stringify(summary('fbawc', n)));
    }
    const r1 = runBracketImport('fbawc', [entry(10), entry(12)], dir);
    expect(r1.problems).toEqual([]);
    expect(r1.report).toEqual({ set: 1, unchanged: 0, missingSummary: ['S12'], replaced: [] });
    const s10 = JSON.parse(readFileSync(path.join(dir, 'leagues/fbawc/S10/summary.json'), 'utf8'));
    expect(s10.pastBracket.rounds).toBe(1);
    expect(JSON.parse(readFileSync(path.join(dir, 'leagues/fbawc/S11/summary.json'), 'utf8')).pastBracket).toBeUndefined();
    expect(runBracketImport('fbawc', [entry(10)], dir).report.unchanged).toBe(1);
  });
  it('writes nothing when a doc fails its schema', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'brk-'));
    dirs.push(dir);
    mkdirSync(path.join(dir, 'leagues', 'fbawc', 'S10'), { recursive: true });
    const file = path.join(dir, 'leagues/fbawc/S10/summary.json');
    writeFileSync(file, JSON.stringify(summary('fbawc', 10)));
    const bad = { ...entry(10), rounds: 3 };
    const r = runBracketImport('fbawc', [bad], dir);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).pastBracket).toBeUndefined();
  });
});
