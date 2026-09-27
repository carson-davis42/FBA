import { describe, expect, it } from 'vitest';
import { parseCalendarTab, parseD2RosterTab, parseFbaRosterTab, parseD2ReservesTab, parseFreeAgentsTab, parsePickRows } from './parsers';

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
  it('stops at the Reserves section', () => {
    const rows = [['Zurich(Switzerland)'], ['(PG)', 'Markus Edmonds', '31', '98'], [], ['Reserves'], ['(PG)', 'Kris Dyer', '30', '']];
    expect(parseD2RosterTab(rows).map(t => t.name)).toEqual(['Zurich']);
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

describe('restricted contracts on the FBA tab', () => {
  it('flags players whose contract-end cell is underlined', () => {
    const rows = [['', '', 'Atlanta Venom'], ['', '', '(PF)', '', 'Rakeem Holloway', '20', '75', 'S79', '2'], ['', '', '(C)', '', 'Issa Cisse', '26', '84', 'S81', '7']];
    const [t] = parseFbaRosterTab(rows, new Set(['1:7']));
    expect(t.players[0]).toEqual({ name: 'Rakeem Holloway', position: 'PF', age: 20, rating: 75, contractEnd: 79, contractAmount: 2, restricted: true });
    expect(t.players[1]).not.toHaveProperty('restricted');
  });
});

describe('parseFreeAgentsTab', () => {
  const rows = [
    ['On Roster(Unrestricted)', 'On Roster(Restricted)', 'Not on a Roster'],
    ['Name', 'Pos', 'Age', 'Rating', 'Possible Teams'],
    ['Restricted FAs'], ['Next:', 'NONE'],
    ['Free Agents'],
    ['Mubiru Okeke', 'SF', '28', '69', ''],
    ['Bobbie Allen', 'C', '32', '68', 'X'],
    ['Milan Tepic', 'C', '22', 'X', 'R'],
    [''],
    [' Top D2'], ['NONE'],
  ];
  it('reads the Free Agents section until Top D2', () => {
    expect(parseFreeAgentsTab(rows)).toEqual([
      { name: 'Mubiru Okeke', position: 'SF', age: 28, rating: 69, note: '' },
      { name: 'Bobbie Allen', position: 'C', age: 32, rating: 68, note: 'X' },
      { name: 'Milan Tepic', position: 'C', age: 22, rating: null, note: 'R' },
    ]);
  });
  it('throws without a Free Agents section', () => {
    expect(() => parseFreeAgentsTab([['Name']])).toThrow(/Free Agents/);
  });
});

describe('parseD2ReservesTab', () => {
  it('reads players after the Reserves header', () => {
    const rows = [['Zurich(Switzerland)'], ['(PG)', 'Markus Edmonds', '31', '98'], [], ['Reserves'], ['(PG)', 'Kris Dyer', '30', ''], ['(C)', 'X', 'X', 'X']];
    expect(parseD2ReservesTab(rows)).toEqual([{ name: 'Kris Dyer', position: 'PG', age: 30, rating: null, contractEnd: null, contractAmount: null }]);
  });
  it('returns nothing without a Reserves section', () => {
    expect(parseD2ReservesTab([['Zurich(Switzerland)']])).toEqual([]);
  });
});

describe('parsePickRows', () => {
  it('parses owners, protections, history, and priority', () => {
    const rows = [
      ['OV(via DCB)(S75)', 'Top 9 Protected', 'Originally LP', 'priority 1'],
      ['NY(via DCB)(S79)', 'Top 11 Protected', 'Originally 12P', 'priority 2'],
      ['CHI(via LA)(S81)', 'Lottery Protected', '', ''],
      ['CHI(via SAS)(S81)', '', '', ''],
      ['MEM(via VEG)(S81)', 'if VEG misses playoffs', '', ''],
      ['', '', '', ''],
      ['TEAM', 'PLAYER', 'POSITION'],
    ];
    expect(parsePickRows(rows, 80)).toEqual([
      { season: 80, owner: 'OV', originalTeam: 'DCB', originSeason: 75, condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, priority: 1 },
      { season: 80, owner: 'NY', originalTeam: 'DCB', originSeason: 79, condition: { kind: 'top', n: 11 }, originalCondition: { kind: 'top', n: 12 }, priority: 2 },
      { season: 80, owner: 'CHI', originalTeam: 'LA', originSeason: 81, condition: { kind: 'lottery' }, originalCondition: { kind: 'lottery' }, priority: null },
      { season: 80, owner: 'CHI', originalTeam: 'SAS', originSeason: 81, condition: { kind: 'none' }, originalCondition: { kind: 'none' }, priority: null },
      { season: 80, owner: 'MEM', originalTeam: 'VEG', originSeason: 81, condition: { kind: 'custom', text: 'if VEG misses playoffs' }, originalCondition: { kind: 'custom', text: 'if VEG misses playoffs' }, priority: null },
    ]);
  });
  it('rejects a row it cannot read', () => {
    expect(() => parsePickRows([['Chicago gets LA pick']], 81)).toThrow(/pick row/);
  });
});
