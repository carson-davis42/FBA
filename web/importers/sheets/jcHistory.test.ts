import { describe, expect, it } from 'vitest';
import { Report } from '../report';
import {
  parseAllAmericans, parseConferenceAwards, parseNationalAwards, parseNationalChampions, parseNitChampions,
  parsePreseason, parseRegularSeasonChampions, parseTournamentChampions,
} from './jcHistory';

describe('parseNationalChampions', () => {
  const rows = [
    ['Year', 'Champion', 'Runner-Up', 'Score', 'C-Ship MVP', 'Date'],
    ['', 'JC Era'],
    ['S1', 'Duke', 'Virginia', 'X', 'Charles Latley', 'X'],
    ['S12', 'Duke', 'TCU', '28-27', 'Demarcus Allen', 'X'],
    ['S78', 'North Carolina', 'Syracuse', '100-93', 'Rylan Rush', '2026-05-22'],
    ['S73', 'Ohio State', 'Michigan', 'X', 'X', '2024-07-09'],
  ];
  it('reads champion, runner-up, score and MVP, treating X as none, and skips header rows', () => {
    expect(parseNationalChampions(rows)).toEqual([
      { season: 1, champion: 'Duke', runnerUp: 'Virginia', score: null, mvp: 'Charles Latley' },
      { season: 12, champion: 'Duke', runnerUp: 'TCU', score: '28-27', mvp: 'Demarcus Allen' },
      { season: 78, champion: 'North Carolina', runnerUp: 'Syracuse', score: '100-93', mvp: 'Rylan Rush' },
      { season: 73, champion: 'Ohio State', runnerUp: 'Michigan', score: null, mvp: null },
    ]);
  });
  it('reports a row with no champion instead of dropping it silently', () => {
    const report = new Report();
    expect(parseNationalChampions([['S5', 'X', 'Duke']], report)).toEqual([]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('S5'))).toBe(true);
  });
});

describe('parseNitChampions', () => {
  it('reads champion, runner-up and MVP', () => {
    const rows = [['Year', 'Champion', 'Runner-Up', 'C-Ship MVP', 'Date'], ['S72', 'Seton Hall', 'Purdue', 'Rhys Creed', '2024-04-17'], ['S78', 'Creighton', 'Oklahoma', 'Camden Sutter', '2026-05-22']];
    expect(parseNitChampions(rows)).toEqual([
      { season: 72, champion: 'Seton Hall', runnerUp: 'Purdue', mvp: 'Rhys Creed' },
      { season: 78, champion: 'Creighton', runnerUp: 'Oklahoma', mvp: 'Camden Sutter' },
    ]);
  });
});

describe('parseNationalAwards', () => {
  const rows = [
    ['', 'Trae York', 'Player of the Year'],
    ['S11', 'Trae York', 'TCU'],
    ['S12', 'Demarcus Allen', 'Duke'],
    ['', 'Angelo Farrell', 'Freshman of the Year'],
    ['S16', 'Rhett Blackwell', 'Villanova'],
    ['', 'Dawson Chudnovsky', 'Defensive POY'],
    ['S57', 'Dustin Holloway', 'UCLA'],
    ['', '', ''],
    ['', 'All-Americans', ''],
    ['S53', '', ''],
    ['OUT', 'Jaime Snow', 'Florida State'],
  ];
  it('reads each award block, stopping at the All-Americans', () => {
    expect(parseNationalAwards(rows)).toEqual([
      { season: 11, award: 'POY', name: 'Trae York', school: 'TCU' },
      { season: 12, award: 'POY', name: 'Demarcus Allen', school: 'Duke' },
      { season: 16, award: 'FOY', name: 'Rhett Blackwell', school: 'Villanova' },
      { season: 57, award: 'DPOY', name: 'Dustin Holloway', school: 'UCLA' },
    ]);
  });
});

describe('parseAllAmericans', () => {
  const rows = [
    ['', 'Trae York', 'Player of the Year'],
    ['S11', 'Trae York', 'TCU'],
    ['', 'All-Americans', ''],
    ['S53', '', ''],
    ['OUT', 'Jaime Snow', 'Florida State'],
    ['OUT', 'Westley Warren', 'Syracuse'],
    ['MID', 'Leonard Harris', 'Stanford'],
    ['IN', 'Dawson Chudnovsky', 'Duke'],
    ['', '', ''],
    ['S59', '', ''],
    ['IN', 'Mel Duncan', 'Villanova'],
    ['ANY', 'Mitchell Carson', 'Butler'],
    ['', '', ''],
    ['S68', '', ''],
    ['', 'Team 1', ''],
    ['PG', 'Kobie McKay', 'Gonzaga'],
    ['C', 'Derek King', 'UCLA'],
    ['', 'Team 2', ''],
    ['PG', 'Elliott Sparrow', 'Texas Tech'],
    ['S71', '', ''],
    ['', 'Team 1', ''],
    ['G', 'Yasin Milovanović', 'Iowa'],
    ['ANY', 'Dimitri Quickley', 'Duke'],
    ['ANY', 'Shepherd Beckett', 'Nevada'],
  ];
  const aa = parseAllAmericans(rows);
  it('reads a season with no team header as team 1, keeping the slot labels', () => {
    expect(aa.find(s => s.season === 53)).toEqual({
      season: 53,
      teams: [{ team: 1, slots: [
        { slot: 'OUT', name: 'Jaime Snow', school: 'Florida State' },
        { slot: 'OUT', name: 'Westley Warren', school: 'Syracuse' },
        { slot: 'MID', name: 'Leonard Harris', school: 'Stanford' },
        { slot: 'IN', name: 'Dawson Chudnovsky', school: 'Duke' },
      ] }],
    });
  });
  it('reads the ANY slot of S59', () => {
    expect(aa.find(s => s.season === 59)!.teams[0].slots.map(s => s.slot)).toEqual(['IN', 'ANY']);
  });
  it('splits teams at the Team n rows', () => {
    const s68 = aa.find(s => s.season === 68)!;
    expect(s68.teams.map(t => [t.team, t.slots.map(x => x.slot)])).toEqual([[1, ['PG', 'C']], [2, ['PG']]]);
  });
  it('keeps repeated ANY slots in order', () => {
    expect(aa.find(s => s.season === 71)!.teams[0].slots.map(s => s.name)).toEqual(['Yasin Milovanović', 'Dimitri Quickley', 'Shepherd Beckett']);
  });
  it('has nothing for a season that is absent (S56) and ignores the award blocks above', () => {
    expect(aa.map(s => s.season)).toEqual([53, 59, 68, 71]);
  });
});

describe('parseConferenceAwards', () => {
  const rows = [
    ['', 'Big 12', '', 'ACC', '', 'Ivy League', ''],
    ['S52', 'Chandler Arias', 'Texas Tech', 'Jaylen Oden', 'Duke', 'X', 'X'],
    ['S54', 'Alan Darwin', 'Kansas', 'Dawson Chudnovsky', 'Duke', 'Ricky Rush', 'Penn'],
  ];
  it('reads player and school pairs per conference, skipping X', () => {
    expect(parseConferenceAwards(rows)).toEqual([
      { season: 52, conf: 'Big 12', name: 'Chandler Arias', school: 'Texas Tech' },
      { season: 52, conf: 'ACC', name: 'Jaylen Oden', school: 'Duke' },
      { season: 54, conf: 'Big 12', name: 'Alan Darwin', school: 'Kansas' },
      { season: 54, conf: 'ACC', name: 'Dawson Chudnovsky', school: 'Duke' },
      { season: 54, conf: 'Ivy League', name: 'Ricky Rush', school: 'Penn' },
    ]);
  });
});

describe('parseRegularSeasonChampions', () => {
  const rows = [
    ['', 'Big 12', 'ACC', 'SEC'],
    ['S53', 'Kansas(12-3)', 'Duke(14-1)', 'Kentucky(13-2)'],
    ['', 'Kansas State', 'X', 'Tennessee'],
    ['', 'Texas Tech', 'X', 'X'],
    ['S54', 'Kansas(16-3)', 'Virginia(17-2)', 'Kentucky(16-3)'],
    ['', 'X', 'X', 'Tennessee'],
    ['S56', 'Texas(16-3)', 'North Carolina(18-1)', 'Kentucky(18-1)'],
  ];
  const out = parseRegularSeasonChampions(rows);
  it('reads the record on the first row and no record on co-champion rows', () => {
    expect(out.filter(r => r.season === 53 && r.conf === 'Big 12')).toEqual([
      { season: 53, conf: 'Big 12', school: 'Kansas', record: '12-3' },
      { season: 53, conf: 'Big 12', school: 'Kansas State', record: null },
      { season: 53, conf: 'Big 12', school: 'Texas Tech', record: null },
    ]);
  });
  it('skips X and keeps the season across continuation rows', () => {
    expect(out.filter(r => r.season === 54 && r.conf === 'SEC').map(r => r.school)).toEqual(['Kentucky', 'Tennessee']);
    expect(out.filter(r => r.conf === 'ACC').map(r => r.school)).toEqual(['Duke', 'Virginia', 'North Carolina']);
  });
});

describe('parseTournamentChampions', () => {
  const rows = [
    ['', 'Big 12', 'ACC', 'Ivy League'],
    ['S52', 'X', 'X', 'X'],
    ['S54', 'Texas Tech', 'Duke', 'Penn'],
    ['S57', 'Texas', 'Louisville', 'Cornell'],
  ];
  it('reads one school per conference and skips X', () => {
    expect(parseTournamentChampions(rows)).toEqual([
      { season: 54, conf: 'Big 12', school: 'Texas Tech' },
      { season: 54, conf: 'ACC', school: 'Duke' },
      { season: 54, conf: 'Ivy League', school: 'Penn' },
      { season: 57, conf: 'Big 12', school: 'Texas' },
      { season: 57, conf: 'ACC', school: 'Louisville' },
      { season: 57, conf: 'Ivy League', school: 'Cornell' },
    ]);
  });
});

describe('parsePreseason', () => {
  const rows = [
    ['', 'Champions Classic', 'Maui Jim Invitational', 'Cuts Classic'],
    ['S64', 'Wake Forest', 'Alabama', 'X'],
    ['S70', 'UCLA', 'Purdue', 'TCU'],
  ];
  it('reads one champion per event, skipping events not yet played', () => {
    expect(parsePreseason(rows)).toEqual([
      { season: 64, event: 'Champions Classic', champion: 'Wake Forest' },
      { season: 64, event: 'Maui Jim Invitational', champion: 'Alabama' },
      { season: 70, event: 'Champions Classic', champion: 'UCLA' },
      { season: 70, event: 'Maui Jim Invitational', champion: 'Purdue' },
      { season: 70, event: 'Cuts Classic', champion: 'TCU' },
    ]);
  });
});
