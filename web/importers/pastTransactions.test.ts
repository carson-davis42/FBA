import { describe, expect, it } from 'vitest';
import { PastTransactionsFile } from '../engine/shared/types';
import type { FranchisesFile, PlayersFile } from '../engine/shared/types';
import { buildPastTransactions } from './pastTransactions';
import { Report } from './report';

const franchises: FranchisesFile = {
  franchises: [
    { teamId: 'SAS', eras: [
      { name: 'San Antonio Stars', abbr: 'SAS', city: 'San Antonio', from: 57, to: null },
      { name: 'Utah Stars', abbr: 'USA', city: 'Utah', from: 1, to: 56 },
    ] },
    { teamId: 'CGG', eras: [{ name: 'Chicago Giants', abbr: 'CGG', city: 'Chicago', from: 1, to: null }] },
  ],
};
const players: PlayersFile = { nextId: 2, players: { p00001: { id: 'p00001', name: 'Clay Peterson', birthSeason: 10 } } };

const rows = [
  ['S33'], ['CGG/USA', 'Before Week 7'], ['->CGG', 'OUT-Clay Peterson'], ['->USA', 'S41 Draft Pick(via MIL)'],
  ['ZZ'], ['Cut', 'PG-Nobody Known'],
  ['Traded Away', 'x'],
  ['Cut', ''],
];

describe('buildPastTransactions', () => {
  it('maps codes, resolves players and reports problems', () => {
    const report = new Report();
    const doc = buildPastTransactions(rows, { players, franchises }, report);
    const [trade, cut] = doc.seasons[0].entries;
    expect(trade).toMatchObject({ kind: 'trade', teamIds: ['CGG', 'SAS'] });
    if (trade.kind !== 'trade') throw new Error('expected a trade');
    expect(trade.moves.map(m => m.to)).toEqual(['CGG', 'SAS']);
    expect(trade.moves[0].asset).toEqual({ text: 'OUT-Clay Peterson', pos: 'OUT', name: 'Clay Peterson', playerId: 'p00001' });
    expect(trade.moves[1].asset).toEqual({ text: 'S41 Draft Pick(via MIL)', pos: null, name: null, playerId: null });
    expect(cut).toMatchObject({ kind: 'cut', teamId: 'ZZ' });
    const warns = report.entries.filter(e => e.level === 'warn');
    expect(warns.some(e => e.topic === 'transactions' && e.message.includes('ZZ'))).toBe(true);
    expect(warns.some(e => e.message.includes('has no asset'))).toBe(true);
    expect(report.entries.filter(e => e.level === 'info')).toHaveLength(1);
    expect(PastTransactionsFile.safeParse(doc).success).toBe(true);
  });
});
