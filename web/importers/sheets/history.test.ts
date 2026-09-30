import { describe, expect, it } from 'vitest';
import { decodeScore, parseAllFba, parseAwards, parseBios, parseChampionships, parsePastStandings, splitNameTeam } from './history';

describe('decodeScore', () => {
  it('reads a date cell as month–day', () => expect(decodeScore('2026-04-01')).toBe('4–1'));
  it('reads an Excel serial as month–day', () => {
    expect(decodeScore('43862')).toBe('2–1');
    expect(decodeScore('45384')).toBe('4–2');
    expect(decodeScore('46113.0')).toBe('4–1');
  });
  it('formats plain text', () => expect(decodeScore('1-0')).toBe('1–0'));
  it('treats X and empty as null', () => {
    expect(decodeScore('X')).toBeNull();
    expect(decodeScore('')).toBeNull();
  });
});

describe('splitNameTeam', () => {
  it('splits at the last hyphen', () => {
    expect(splitNameTeam('Paulo Pierre-Kent-CGG')).toEqual({ name: 'Paulo Pierre-Kent', team: 'CGG' });
    expect(splitNameTeam('Mikey Brewer-FP')).toEqual({ name: 'Mikey Brewer', team: 'FP' });
  });
  it('accepts a D2 team', () => expect(splitNameTeam('Jo Smith-D2(Beijing)')).toEqual({ name: 'Jo Smith', team: 'D2(Beijing)' }));
  it('has no team without a hyphen', () => expect(splitNameTeam('Team Julien Shannon')).toEqual({ name: 'Team Julien Shannon', team: null }));
  it('is null for empty cells', () => {
    expect(splitNameTeam('X')).toBeNull();
    expect(splitNameTeam('')).toBeNull();
  });
});

describe('parseChampionships', () => {
  const rows = [
    ['Year', '', 'Winner', 'Runner up', '', 'Series Score', 'Finals MVP', 'Date'],
    ['S1', '', 'Cypress Green Guns', 'Former Pirates', '', '1-0', 'Carson Davis', 'X'],
    ['S78', '', 'Boston Bucks', 'Memphis Blues', '', '46113.0', 'Gabriel Greenwood', '46154.0'],
    ['S55(1)', '', 'Some Team', 'X', '', '', 'X'],
  ];
  it('reads the champion columns', () => {
    expect(parseChampionships(rows)).toEqual([
      { season: 1, champion: 'Cypress Green Guns', runnerUp: 'Former Pirates', score: '1–0', finalsMvp: 'Carson Davis' },
      { season: 78, champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4–1', finalsMvp: 'Gabriel Greenwood' },
      { season: 55, champion: 'Some Team', runnerUp: null, score: null, finalsMvp: null },
    ]);
  });
});

describe('parseAwards', () => {
  const header = ['Year', '', '', 'WC Champion', '', '', 'EC Champion', '', '', 'MVP', '', '', 'ROTY', '', '', 'PPK Award', '', '', 'LP Award', '', '', 'MC Award', '', '', 'DPOY', '', '', 'MIP', '', 'ASG Winner', '', 'ASG Losing Captain', '', '', 'ASG MVP', '', 'YSG', '', '', 'YSG MVP', '', '', '5pt Contest', '', '', 'Dunk Contest'];
  const s1 = ['S1', '', '', 'Cypress Green Guns', '', '', 'Former Pirates', '', '', 'Mikey Brewer-FP', '', '', 'X', '', '', 'X', '', '', 'X', '', '', 'X', '', '', 'X', '', '', 'X', '', 'X', '', 'X', '', '', 'X', '', 'X', '', '', 'X', '', '', 'X', '', '', 'X'];
  const s78 = ['S78', '', '', 'Honolulu Rays', '', '', 'Carolina Knights', '', '', 'Reagan Butler-HON', '', '', 'Soren Lindberg-SEA', '', '', 'Reagan Butler-HON', '', '', 'Byron Oden-NO', '', '', 'Katleho Cisneros-SAS', '', '', 'Jelani Soweto-CAR', '', '', 'KJ Cooke-MAN', '', 'Team Cameron Lucic', '', 'Team Reagan Butler', '', '', 'Ivory Huntley-MEM', '', 'Team Akeem Naylor', '', '', 'Kai Richardson-OV', '', '', 'Clarke Ewing-DCB', '', '', 'Terence Hopkins-CAR'];
  it('reads S1 as mostly empty', () => {
    const [r] = parseAwards([header, s1]);
    expect(r).toEqual({ season: 1, west: 'Cypress Green Guns', east: 'Former Pirates', awards: { MVP: { name: 'Mikey Brewer', team: 'FP' } },
      asgWinner: null, asgLoser: null, asgMvp: null, ysgWinner: null, ysgMvp: null, fivePoint: null, dunk: null });
  });
  it('reads S78 by header', () => {
    const r = parseAwards([header, s1, s78])[1];
    expect(r.awards.MVP).toEqual({ name: 'Reagan Butler', team: 'HON' });
    expect(r.awards.MIP).toEqual({ name: 'KJ Cooke', team: 'MAN' });
    expect(r.west).toBe('Honolulu Rays');
    expect(r.asgWinner).toBe('Team Cameron Lucic');
    expect(r.asgLoser).toBe('Team Reagan Butler');
    expect(r.asgMvp).toEqual({ name: 'Ivory Huntley', team: 'MEM' });
    expect(r.ysgWinner).toBe('Team Akeem Naylor');
    expect(r.ysgMvp).toEqual({ name: 'Kai Richardson', team: 'OV' });
    expect(r.fivePoint).toEqual({ name: 'Clarke Ewing', team: 'DCB' });
    expect(r.dunk).toEqual({ name: 'Terence Hopkins', team: 'CAR' });
  });
  it('throws on a missing header', () => {
    expect(() => parseAwards([header.map(h => (h === 'DPOY' ? 'Defense' : h)), s1])).toThrow('Awards tab: no "DPOY" column');
  });
});

describe('parseAllFba', () => {
  const rows = [
    ['Year', 'POS', 'All-FBA Team 1', 'All-FBA Team 2'],
    ['S58'],
    ['', 'OUT', "Ignazio D'Angelo-DCB", 'Timothy Cole-NO'],
    ['', 'MID', 'Tristin Kidd-OAK', 'Brooks Whittaker-SAS'],
    ['', 'M2', 'Jaime Snow-OV', 'Russ Werner-NO'],
    ['', 'IN', 'Kellen Haas-CP', 'Willis Fox-MIL'],
    ['S68'],
    ['', 'G', 'Buddy Merritt-SEA', "Ignazio D'Angelo-DCB"],
    ['', 'F', 'Akeem Naylor-CIN', 'Clyde King-MIL'],
    ['', 'C', 'Darius Crewe-DCB', 'Keith Russell-OV'],
    ['', 'ANY', 'Kamden Pierre-Kent-DEN', 'Michal Ewing-FLO'],
    ['', 'ANY', 'Timothy Cole-NY', 'X'],
  ];
  it('groups slots by season', () => {
    const [a, b] = parseAllFba(rows);
    expect(a.season).toBe(58);
    expect(a.slots).toEqual(['OUT', 'MID', 'M2', 'IN']);
    expect(a.team1[0]).toEqual({ name: "Ignazio D'Angelo", team: 'DCB' });
    expect(a.team2[3]).toEqual({ name: 'Willis Fox', team: 'MIL' });
    expect(b.season).toBe(68);
    expect(b.slots).toEqual(['G', 'F', 'C', 'ANY', 'ANY']);
    expect(b.team1[3]).toEqual({ name: 'Kamden Pierre-Kent', team: 'DEN' });
    expect(b.team2[4]).toBeNull();
  });
});

describe('parsePastStandings', () => {
  const rows = [
    ['', '', '', '', '', '', '', '', '', ''],
    ['', 'Rank', 'Eastern', 'W', 'L', '', 'Rank', 'Western', 'W', 'L'],
    ['', '1.0', 'Carolina Knights', '62.0', '24.0', '', '1.0', 'Honolulu Rays', '66.0', '20.0'],
    ['', '2.0', 'Boston Bucks', '61.0', '25.0', '', '2.0', 'New Orleans Seminoles', '63.0', '23.0'],
  ];
  it('reads east and west', () => {
    expect(parsePastStandings(rows)).toEqual([
      { group: 'E', rank: 1, name: 'Carolina Knights', w: 62, l: 24 },
      { group: 'W', rank: 1, name: 'Honolulu Rays', w: 66, l: 20 },
      { group: 'E', rank: 2, name: 'Boston Bucks', w: 61, l: 25 },
      { group: 'W', rank: 2, name: 'New Orleans Seminoles', w: 63, l: 23 },
    ]);
  });
});

describe('parseBios', () => {
  const rows = [
    ['Philip Horne', 'Born-S51', 'Iona-S69', 'Iowa-S70-S72', '1x B10 TOUR Champion', 'D2(Beijing)-S73-pres.'],
    ['', 'Born-S1'],
    ['Paulie Gregory', 'Born-S61'],
  ];
  it('reads name, born and entries', () => {
    expect(parseBios(rows)).toEqual([
      { name: 'Philip Horne', born: 'Born-S51', entries: ['Iona-S69', 'Iowa-S70-S72', '1x B10 TOUR Champion', 'D2(Beijing)-S73-pres.'] },
      { name: 'Paulie Gregory', born: 'Born-S61', entries: [] },
    ]);
  });
});
