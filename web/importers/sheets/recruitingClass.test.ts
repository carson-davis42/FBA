import { describe, expect, it } from 'vitest';
import { parseClassSection, parseSchoolCell } from './recruitingClass';

const rows: string[][] = [
  ['S78', '', '', '', '', '', ''],
  ['1', '5*', 'PG', 'Old Guy', '90', 'Duke', '99.1'],
  [],
  ['S79', '', '', '', '', '', ''],
  ['1', '5*', 'PG', 'JJ Clarke', '95', 'Gonzaga', '98.8'],
  ['2', '4*', 'C', 'Don Goldyn', '88', 'Wichita State', '85.25'],
  ['3', '3*', 'SF', 'Some Kid', '74', '3 PROJ - UK, ARIZ, GU', '72'],
];

describe('parseClassSection', () => {
  it('returns the rows under the S79 header with numbers parsed', () => {
    expect(parseClassSection(rows, 79)).toEqual([
      { rank: 1, stars: 5, position: 'PG', name: 'JJ Clarke', r: 95, school: 'Gonzaga', consensus: 98.8 },
      { rank: 2, stars: 4, position: 'C', name: 'Don Goldyn', r: 88, school: 'Wichita State', consensus: 85.25 },
      { rank: 3, stars: 3, position: 'SF', name: 'Some Kid', r: 74, school: '3 PROJ - UK, ARIZ, GU', consensus: 72 },
    ]);
  });

  it('stops at the next section header as well as a blank row', () => {
    const r = parseClassSection([['S79'], ['1', '5*', 'PG', 'A', '90', 'x', '95'], ['S80'], ['1', '5*', 'PG', 'B', '90', 'x', '95']], 79);
    expect(r.map(x => x.name)).toEqual(['A']);
  });

  it('throws when there is no such section', () => {
    expect(() => parseClassSection(rows, 80)).toThrow('No S80 section in the FBA JC Recruiting tab');
  });

  it('throws on a malformed row', () => {
    expect(() => parseClassSection([['S79'], ['1', '2*', 'PG', 'A', '90', 'x', '95']], 79)).toThrow(/row 2/);
  });
});

describe('parseSchoolCell', () => {
  it('reads a projection list', () => {
    expect(parseSchoolCell('3 PROJ - UK, ARIZ, GU')).toEqual({ kind: 'projections', count: 3, codes: ['UK', 'ARIZ', 'GU'] });
  });
  it('reads "none" as no schools', () => {
    expect(parseSchoolCell('0 PROJ - none')).toEqual({ kind: 'projections', count: 0, codes: [] });
  });
  it('reads anything else as a commitment', () => {
    expect(parseSchoolCell('Gonzaga')).toEqual({ kind: 'committed', school: 'Gonzaga' });
  });
});
