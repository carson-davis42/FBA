import { describe, expect, it } from 'vitest';
import { parseFranchiseTab } from './franchises';

/** A CAR-style tab: header row, award columns to the right, then name-era blocks in column A, newest first. */
function carTab(): string[][] {
  const rows: string[][] = Array.from({ length: 52 }, () => []);
  rows[0] = ['Team Info', 'Championships', 'C-Ship app.'];
  rows[2] = ['', '(S57)', '(S56)'];
  const block = (at: number, cells: string[]) => cells.forEach((c, k) => { rows[at + k] = [c, k === 0 ? '(S70)' : '']; });
  block(8, ['Carolina Knights', 'CAR', '(Charlotte, North Carolina)', 'S73-pres.']);
  block(21, ['Charlotte Knights', 'CHA', '(Charlotte, North Carolina)', 'S68-S72']);
  block(33, ['Cal Tech Golden Knights', 'CT', '(Sacramento, California)', 'S57-S67']);
  block(46, ['Cal Tech Knights', 'CT', '(Sacramento, California)', 'S41-S56']);
  return rows;
}

describe('parseFranchiseTab', () => {
  it('reads every name era in sheet order', () => {
    const { eras, problems } = parseFranchiseTab(carTab());
    expect(problems).toEqual([]);
    expect(eras).toEqual([
      { name: 'Carolina Knights', abbr: 'CAR', city: 'Charlotte, North Carolina', from: 73, to: null },
      { name: 'Charlotte Knights', abbr: 'CHA', city: 'Charlotte, North Carolina', from: 68, to: 72 },
      { name: 'Cal Tech Golden Knights', abbr: 'CT', city: 'Sacramento, California', from: 57, to: 67 },
      { name: 'Cal Tech Knights', abbr: 'CT', city: 'Sacramento, California', from: 41, to: 56 },
    ]);
  });
  it('reads a one-season era written as a single season', () => {
    const rows: string[][] = [['Florida Panthers'], ['FLO'], ['(Orlando, Florida)'], ['S11']];
    expect(parseFranchiseTab(rows).eras).toEqual([{ name: 'Florida Panthers', abbr: 'FLO', city: 'Orlando, Florida', from: 11, to: 11 }]);
  });
  it('accepts "pres" without the dot', () => {
    const rows: string[][] = [['Denver Heights'], ['DEN'], ['(Denver, Colorado)'], ['S61-pres']];
    expect(parseFranchiseTab(rows).eras).toEqual([{ name: 'Denver Heights', abbr: 'DEN', city: 'Denver, Colorado', from: 61, to: null }]);
  });
  it('reports and skips a block with a missing cell', () => {
    const rows = carTab();
    rows[22] = [''];
    const { eras, problems } = parseFranchiseTab(rows);
    expect(eras.map(e => e.name)).toEqual(['Carolina Knights', 'Cal Tech Golden Knights', 'Cal Tech Knights']);
    expect(problems).toEqual(['row 25: era "S68-S72" is missing its name, abbreviation or (city)']);
  });
});
