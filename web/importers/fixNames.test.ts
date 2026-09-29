import { describe, expect, it } from 'vitest';
import type { PlayersFile } from '../engine/shared/types';
import { applyNameFixes, planNameFixes } from './fixNames';
import { Report } from './report';
import type { SheetPlayer } from './sheets/playersTab';

const sheet: SheetPlayer[] = [
  { name: 'Kellan Ogbu', born: 59 },
  { name: 'Saun Payton', born: 53 },
  { name: 'Jon Smith', born: 60 },
  { name: 'Jon Smyth', born: 61 },
  { name: 'Same Guy', born: 1 },
];

const players = (): PlayersFile => ({
  nextId: 7,
  players: {
    p00001: { id: 'p00001', name: 'Kellen Ogbu', birthSeason: 59 },
    p00002: { id: 'p00002', name: 'Totally Unknown', birthSeason: 1 },
    p00003: { id: 'p00003', name: 'Jon Smoth', birthSeason: 2 },
    p00004: { id: 'p00004', name: null, birthSeason: null },
    p00005: { id: 'p00005', name: 'Same Guy', birthSeason: 1 },
    p00006: { id: 'p00006', name: 'Saun Peyton', birthSeason: 53 },
  },
});

describe('planNameFixes', () => {
  it('proposes a fix for one close match and reports it', () => {
    const report = new Report();
    const fixes = planNameFixes(players(), sheet, report);
    expect(fixes).toContainEqual({ playerId: 'p00001', from: 'Kellen Ogbu', to: 'Kellan Ogbu' });
    expect(report.entries).toContainEqual({ level: 'info', topic: 'fix-names', message: 'Kellen Ogbu → Kellan Ogbu' });
  });

  it('warns and proposes nothing for no match or two matches', () => {
    const report = new Report();
    const fixes = planNameFixes(players(), sheet, report);
    expect(fixes.map(f => f.playerId).sort()).toEqual(['p00001', 'p00006']);
    const warns = report.entries.filter(e => e.level === 'warn');
    expect(warns).toHaveLength(2);
    expect(warns.some(w => w.message.includes('Totally Unknown'))).toBe(true);
    expect(warns.some(w => w.message.includes('Jon Smoth'))).toBe(true);
  });

  it('ignores unnamed players and names already in the sheet', () => {
    const report = new Report();
    planNameFixes(players(), sheet, report);
    expect(report.entries.some(e => e.message.includes('Same Guy'))).toBe(false);
  });
});

describe('applyNameFixes', () => {
  it('renames only the listed ids, honours skip, and returns a new object', () => {
    const before = players();
    const fixes = [
      { playerId: 'p00001', from: 'Kellen Ogbu', to: 'Kellan Ogbu' },
      { playerId: 'p00006', from: 'Saun Peyton', to: 'Saun Payton' },
    ];
    const next = applyNameFixes(before, fixes, ['Saun Peyton']);
    expect(next).not.toBe(before);
    expect(next.players.p00001.name).toBe('Kellan Ogbu');
    expect(next.players.p00006.name).toBe('Saun Peyton');
    expect(next.players.p00002.name).toBe('Totally Unknown');
    expect(before.players.p00001.name).toBe('Kellen Ogbu');
  });
});
