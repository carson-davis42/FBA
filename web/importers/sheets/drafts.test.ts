import { describe, expect, it } from 'vitest';
import { draftTabKind, parseDraftTab } from './drafts';

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
