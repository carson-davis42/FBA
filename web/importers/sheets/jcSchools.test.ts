import { describe, expect, it } from 'vitest';
import { Report } from '../report';
import { parseSchoolTab } from './jcSchools';

/** Two schools of the Big 12 tab, trimmed: Baylor (28 appearances in the sheet) is cut down with matching counts. */
const rows = (): string[][] => [
  ['School', 'Baylor', 'BYU'],
  ['MM App.', 'Baylor-3', 'BYU-2'],
  ['', '(S11)', '(S61)'],
  ['', '(S12)', '(S62)'],
  ['', '(S63)', ''],
  ['', '', ''],
  ['Sweet 16', 'Baylor-2', 'BYU-1'],
  ['', '(S11)', '(S62)'],
  ['', '(S63)', ''],
  ['Elite 8', 'Baylor-1', 'BYU-0'],
  ['', '(S63)', ''],
  ['Final Four', 'Baylor-1', 'BYU-0'],
  ['', '(S63)', ''],
  ['NC app.', 'Baylor-1', 'BYU-0'],
  ['', '(S63)', ''],
  ['National Champions', 'Baylor-1', 'BYU-0'],
  ['', '(S63)', ''],
  ['Conf RS Champions', 'Baylor-2', 'BYU-2'],
  ['', '(S60)', '(S62)*A10'],
  ['', '(S66)', '(S64)*A10'],
  ['Conf TOUR Champions', 'Baylor-1', 'BYU-1'],
  ['', '(S62)', '(S63)*A10'],
];

describe('parseSchoolTab', () => {
  it('reads each school with its nine sections', () => {
    const [baylor, byu] = parseSchoolTab(rows());
    expect(baylor.name).toBe('Baylor');
    expect(baylor.mm).toEqual({ app: [11, 12, 63], sweet16: [11, 63], elite8: [63], final4: [63], titleGame: [63], champion: [63] });
    expect(baylor.rsChampion).toEqual([{ season: 60, conf: null }, { season: 66, conf: null }]);
    expect(baylor.confTournament).toEqual([{ season: 62, conf: null }]);
    expect(byu.mm.app).toEqual([61, 62]);
    expect(byu.mm.elite8).toEqual([]);
  });
  it('reads the conference suffix on conference titles', () => {
    const byu = parseSchoolTab(rows())[1];
    expect(byu.rsChampion).toEqual([{ season: 62, conf: 'A10' }, { season: 64, conf: 'A10' }]);
    expect(byu.confTournament).toEqual([{ season: 63, conf: 'A10' }]);
  });
  it('treats a bare star as the early-era marker, not a conference', () => {
    const r = rows();
    r[2][1] = '(S4)*';
    const baylor = parseSchoolTab(r)[0];
    expect(baylor.mm.app).toEqual([4, 12, 63].sort((a, b) => a - b));
  });
  it('accepts the source typo with a missing closing parenthesis and reports it', () => {
    const r = rows();
    r[21][1] = '(S56*B10';
    const report = new Report();
    const baylor = parseSchoolTab(r, report)[0];
    expect(baylor.confTournament).toEqual([{ season: 56, conf: 'B10' }]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('(S56*B10'))).toBe(true);
  });
  it('reports a count that does not match the list', () => {
    const r = rows();
    r[1][1] = 'Baylor-4';
    const report = new Report();
    parseSchoolTab(r, report);
    expect(report.entries.some(e => e.level === 'error' && e.message.includes('Baylor') && e.message.includes('MM App.'))).toBe(true);
  });
  it('reports a cell it cannot read', () => {
    const r = rows();
    r[2][1] = 'S11';
    const report = new Report();
    parseSchoolTab(r, report);
    expect(report.entries.some(e => e.level === 'error' && e.message.includes('"S11"'))).toBe(true);
  });
  it('keeps hyphens inside a school name', () => {
    const r = rows();
    r[0][1] = 'Loyola-Chicago';
    r[1][1] = 'Loyola-Chicago-3';
    expect(parseSchoolTab(r)[0].name).toBe('Loyola-Chicago');
  });
});
