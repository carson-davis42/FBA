import { describe, expect, it } from 'vitest';
import { HallOfFameFile, type PlayersFile } from '../../engine/shared/types';
import { Report } from '../report';
import { parseHallOfFameTab } from './hallOfFame';

const players: PlayersFile = {
  nextId: 5,
  players: {
    p00001: { id: 'p00001', name: 'Matt Quinsler', birthSeason: 1 },
    p00002: { id: 'p00002', name: 'Carson Davis', birthSeason: 1 },
    p00003: { id: 'p00003', name: 'Twin Guy', birthSeason: 1 },
    p00004: { id: 'p00004', name: 'twin guy', birthSeason: 2 },
  },
};

const rows: string[][] = [
  ['Year', 'Name', 'RET'],
  ['S8'],
  ['', 'Matt Quinsler', 'S6'],
  ['', 'USA: FFL-S6'],
  ['', '1x Conference Champion'],
  ['', 'Leon Frins', 'FFL'],
  ['', 'DCB: FFL-FFL'],
  ['S10'],
  ['', '  carson davis ', 'S8'],
  ['', 'CGG: FFL-S8'],
  ['', '6x Conference Champion'],
  ['', '5x FBA Champion'],
  [],
  ['S--', 'Nominees(Keep 15)'],
  ['', 'Twin Guy', 'S70'],
  ['', '1x All-Star'],
  ['', 'Nobody Known', 'S64'],
  ['', 'MEM: S59-S64'],
];

describe('parseHallOfFameTab', () => {
  it('reads classes, cards and nominees', () => {
    const report = new Report();
    const file = parseHallOfFameTab(rows, players, report);
    expect(file.league).toBe('fba');
    expect(file.removed).toEqual([]);
    expect(file.classes.map(c => [c.season, c.inductees.length])).toEqual([['S8', 2], ['S10', 1]]);
    expect(file.classes[0].inductees[0]).toEqual({ name: 'Matt Quinsler', playerId: 'p00001', retiredSeason: 'S6', lines: ['USA: FFL-S6', '1x Conference Champion'] });
    expect(file.classes[0].inductees[1]).toEqual({ name: 'Leon Frins', playerId: null, retiredSeason: 'FFL', lines: ['DCB: FFL-FFL'] });
    expect(file.classes[1].inductees[0].lines).toHaveLength(3);
    expect(file.nominees.map(n => n.name)).toEqual(['Twin Guy', 'Nobody Known']);
    expect(report.hasErrors).toBe(false);
  });

  it('matches a name to exactly one player, case-insensitively and trimmed', () => {
    const file = parseHallOfFameTab(rows, players, new Report());
    expect(file.classes[1].inductees[0].name).toBe('carson davis');
    expect(file.classes[1].inductees[0].playerId).toBe('p00002');
  });

  it('gives null for no match, and null plus a warning for two matches', () => {
    const report = new Report();
    const file = parseHallOfFameTab(rows, players, report);
    expect(file.nominees[0].playerId).toBeNull();
    expect(file.nominees[1].playerId).toBeNull();
    const warns = report.entries.filter(e => e.level === 'warn');
    expect(warns).toHaveLength(1);
    expect(warns[0].topic).toBe('hall-of-fame');
    expect(warns[0].message).toContain('Twin Guy');
  });

  it('accepts a card row that also starts a class', () => {
    const file = parseHallOfFameTab([['Year', 'Name', 'RET'], ['S12', 'Matt Quinsler', 'S6'], ['', 'a line']], players, new Report());
    expect(file.classes).toEqual([{ season: 'S12', inductees: [{ name: 'Matt Quinsler', playerId: 'p00001', retiredSeason: 'S6', lines: ['a line'] }] }]);
  });

  it('reports an error for more than 15 nominees', () => {
    const many: string[][] = [['Year', 'Name', 'RET'], ['S--', 'Nominees(Keep 15)']];
    for (let i = 0; i < 16; i++) many.push(['', `Nominee ${i}`, 'S60']);
    const report = new Report();
    parseHallOfFameTab(many, players, report);
    expect(report.entries.some(e => e.level === 'error' && e.topic === 'hall-of-fame')).toBe(true);
  });

  it('produces a document that passes the schema', () => {
    const file = parseHallOfFameTab(rows, players, new Report());
    expect(HallOfFameFile.safeParse(file).success).toBe(true);
  });

  it('warns about a line before any card', () => {
    const report = new Report();
    parseHallOfFameTab([['Year', 'Name', 'RET'], ['S8'], ['', 'stray line']], players, report);
    expect(report.count('warn')).toBe(1);
  });
});
