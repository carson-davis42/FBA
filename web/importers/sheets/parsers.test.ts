import { describe, expect, it } from 'vitest';
import { parseCalendarTab, parseD2RosterTab, parseFbaRosterTab } from './parsers';

describe('parseFbaRosterTab', () => {
  const rows = [
    ['', '', 'Position/Team', '', 'Player', 'Age', 'Rating', 'Contract End', 'Contract Amount'],
    ['', '', '', '', '', '', 'Updated:', 'Pre-S79', ''],
    [],
    ['', '', 'Carolina Knights', '', '', '', '', '', '23'],
    ['', '', '(PG)', '', 'Jelani Soweto', '24', '92', 'S82', '8'],
    ['', '', '(C)', '', 'X', 'X', 'X', 'X', 'X'],
    ['', '', '', '', '', '', '', '', ''],
  ];
  it('reads teams and players', () => {
    const [t] = parseFbaRosterTab(rows);
    expect(t.name).toBe('Carolina Knights');
    expect(t.country).toBeNull();
    expect(t.players[0]).toEqual({ name: 'Jelani Soweto', position: 'PG', age: 24, rating: 92, contractEnd: 82, contractAmount: 8 });
  });
  it('reads X as a vacant slot', () => {
    expect(parseFbaRosterTab(rows)[0].players[1]).toEqual({ name: null, position: 'C', age: null, rating: null, contractEnd: null, contractAmount: null });
  });
  it('accepts $-prefixed amounts', () => {
    const [t] = parseFbaRosterTab([['', '', 'DCB'], ['', '', '(SG)', '', 'A B', '30', '80', 'S80', '$6']]);
    expect(t.players[0].contractAmount).toBe(6);
  });
  it('drops label rows that have no players', () => {
    expect(parseFbaRosterTab([['', '', 'Notes'], ['', '', 'DCB'], ['', '', '(SG)', '', 'A B', '30', '80', 'S80', '6']]).map(t => t.name)).toEqual(['DCB']);
  });
});

describe('parseD2RosterTab', () => {
  it('splits team and country', () => {
    const rows = [['Position/Team/Conference', 'Player', 'Age', 'Rating'], [], ['Amsterdam(Netherlands)'], ['(PF)', 'Maddox Dean', '22', '94']];
    const [t] = parseD2RosterTab(rows);
    expect(t).toMatchObject({ name: 'Amsterdam', country: 'Netherlands' });
    expect(t.players[0]).toEqual({ name: 'Maddox Dean', position: 'PF', age: 22, rating: 94, contractEnd: null, contractAmount: null });
  });
});

describe('parseCalendarTab', () => {
  const rows = [
    ['S78', '', ''],
    ['*', 'Adjust Age', ''],
    ['12', 'FBAJC', ''],
    ['S79', '', ''],
    ['*', 'Adjust Age', ''],
    ['1', 'S79 FBA Draft', ''],
    ['2', 'Free Agency/Offseason', '*Here*'],
    ['8', 'none', ''],
    ['12', 'FBAJC', ''],
    ['S80', '', ''],
    ['*', 'Adjust Age', ''],
  ];
  it('returns the block containing *Here*', () => {
    expect(parseCalendarTab(rows)).toEqual({
      season: 79,
      hereIndex: 2,
      steps: [
        { label: 'Adjust Age', sub: true },
        { label: 'S79 FBA Draft', sub: false },
        { label: 'Free Agency/Offseason', sub: false },
        { label: 'FBAJC', sub: false },
      ],
    });
  });
  it('throws when there is no *Here* marker', () => {
    expect(() => parseCalendarTab([['S79'], ['1', 'FBA']])).toThrow(/Here/);
  });
});
