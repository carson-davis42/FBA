import { describe, expect, it } from 'vitest';
import { parseAsset, parseTransactionsTab } from './transactions';

const rows = [
  ['Key:'], ['Trade: ->'], ['Trade Deadline: Halfway through', 'season(S72-pres.)'],
  ['S33'], ['CGG/USA', 'Before Week 7'], ['->CGG', 'OUT-Clay Peterson'], ['->USA', 'S41 Draft Pick(via MIL)'], [''],
  ['S62'], ['BOS'], ['Cut', 'OUT-Webb Allen'], ['Signed', 'MID-Freddy King'],
  ['CT', 'Before Week 5'], ['Acquired', 'OUT-Mateo Mosley'],
  ['DCB/NY'], ['S78 Pick Swap', 'DCB GB'], ['->NY', 'PF-Morgan Meyer'],
  ['MW'], ['Traded Away', 'PF-Jamari Odom'], ['Released', 'C-Theon Campos'],
];

describe('parseTransactionsTab', () => {
  it('reads seasons, trades with timing and notes, and team blocks', () => {
    const { seasons, skipped, problems } = parseTransactionsTab(rows);
    expect(problems).toEqual([]);
    expect(skipped).toBe(1);
    expect(seasons.map(s => s.season)).toEqual([33, 62]);
    expect(seasons[0].entries).toEqual([{ kind: 'trade', codes: ['CGG', 'USA'], when: 'Before Week 7', notes: [], moves: [{ to: 'CGG', asset: 'OUT-Clay Peterson' }, { to: 'USA', asset: 'S41 Draft Pick(via MIL)' }] }]);
    expect(seasons[1].entries).toEqual([
      { kind: 'cut', code: 'BOS', when: null, asset: 'OUT-Webb Allen' },
      { kind: 'signed', code: 'BOS', when: null, asset: 'MID-Freddy King' },
      { kind: 'acquired', code: 'CT', when: 'Before Week 5', asset: 'OUT-Mateo Mosley' },
      { kind: 'trade', codes: ['DCB', 'NY'], when: null, notes: ['S78 Pick Swap — DCB GB'], moves: [{ to: 'NY', asset: 'PF-Morgan Meyer' }] },
      { kind: 'released', code: 'MW', when: null, asset: 'C-Theon Campos' },
    ]);
  });
  it('reports rows it cannot place', () => {
    expect(parseTransactionsTab([['S40'], ['Cut', 'OUT-X Y']]).problems).toHaveLength(1);
  });
  it('reports move rows with no asset instead of adding an entry', () => {
    const r = parseTransactionsTab([['S40'], ['AB/CD'], ['->AB', ''], ['EF'], ['Cut', '']]);
    expect(r.problems).toHaveLength(2);
    expect(r.seasons[0].entries).toEqual([{ kind: 'trade', codes: ['AB', 'CD'], when: null, notes: [], moves: [] }]);
  });
});

describe('parseAsset', () => {
  it('splits player assets and leaves picks alone', () => {
    expect(parseAsset('C-Dennis Lofton')).toEqual({ pos: 'C', name: 'Dennis Lofton' });
    expect(parseAsset('SG-Joseph Reid-Jones')).toEqual({ pos: 'SG', name: 'Joseph Reid-Jones' });
    expect(parseAsset('S79 Draft Pick(via MIL)(6P)')).toBeNull();
  });
});
