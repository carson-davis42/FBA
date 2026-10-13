import { describe, expect, it } from 'vitest';
import { dateCell } from './dates';
import { draftTabKind, parseDraftDate, parseDraftTab } from './drafts';

describe('parseDraftTab', () => {
  it('reads picks in order, splits "(via X)", skips the header and blanks', () => {
    const rows = [
      ['Seattle(via OV)', 'Soren Lindberg', 'PG', 'Freshman', 'Arizona'],
      ['', '', '', '', ''],
      ['Undrafted', 'Cai Scott', 'SG', 'Senior', 'LSU'],
      ['TEAM', 'PLAYER', 'POSITION', 'CLASS', 'COLLEGE', '2026-04-23'],
    ];
    expect(parseDraftTab(rows)).toEqual([
      { team: 'Seattle', via: 'OV', name: 'Soren Lindberg', pos: 'PG', detail: 'Freshman', college: 'Arizona' },
      { team: 'Undrafted', via: null, name: 'Cai Scott', pos: 'SG', detail: 'Senior', college: 'LSU' },
    ]);
  });
});

describe('draftTabKind', () => {
  it('classifies tab names', () => {
    expect(draftTabKind('S49')).toEqual({ season: 49, kind: 'draft' });
    expect(draftTabKind('S75 exp')).toEqual({ season: 75, kind: 'expansion' });
    expect(draftTabKind('S68 Exp')).toEqual({ season: 68, kind: 'expansion' });
    expect(draftTabKind('S78 D2')).toBeNull();
    expect(draftTabKind('S79 Draft Board')).toBeNull();
  });
});

describe('parseDraftDate', () => {
  it('takes the date cell of column F, and null when the tab has none', () => {
    expect(parseDraftDate([['TEAM', 'PLAYER', 'POS', 'CLASS', 'COLLEGE'], ['A', 'B', 'PG', 'Fr', 'X', ''], ['C', 'D', 'SG', 'Jr', 'Y', '2026-09-21']])).toBe('2026-09-21');
    expect(parseDraftDate([['A', 'B', 'PG', 'Fr', 'X', 'X']])).toBeNull();
    expect(parseDraftDate([])).toBeNull();
  });
  it('ignores dates outside column F', () => {
    expect(parseDraftDate([['A', 'B', 'PG', '2026-09-21', 'X']])).toBeNull();
  });
});

describe('dateCell', () => {
  it('accepts an ISO day or an Excel serial and rejects X, blanks, scores and impossible days', () => {
    expect(dateCell('2019-10-25')).toBe('2019-10-25');
    expect(dateCell('46154')).toBe('2026-05-12');
    for (const t of ['X', '', undefined, '2-1', '2019-13-40', '2019-02-30', 'Oct 25']) expect(dateCell(t)).toBeNull();
  });
});
