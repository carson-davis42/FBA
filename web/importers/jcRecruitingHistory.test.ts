import { describe, expect, it } from 'vitest';
import { JcRecruitingHistoryFile, type PlayersFile, type TeamsFile } from '../engine/shared/types';
import { buildRecruitingHistory, planJcRecruitingHistory } from './jcRecruitingHistory';
import { Report } from './report';
import { parseRecruitingHistory, parseTransferHistory } from './sheets/jcRecruitingHistory';

const teams: TeamsFile = { league: 'fbajc', teams: [
  { teamId: 'DUKE', name: 'Duke', abbr: 'DUKE', group: 'ACC', logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } },
  { teamId: 'UNC', name: 'North Carolina', abbr: 'UNC', group: 'ACC', logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } },
] };
const players = { nextId: 3, players: { p00001: { id: 'p00001', name: 'Ethan Campbell', birthSeason: null }, p00002: { id: 'p00002', name: 'Twin Name', birthSeason: null }, p00003: { id: 'p00003', name: 'Twin Name', birthSeason: null } } } as PlayersFile;

const recruiting = [
  ['', '*', 'POS', 'Player', 'R', 'School', 'Concensus Rating'],
  ['All', 'Time', '(S68)'],
  ['1', 'S70', 'C', 'Someone', 'X', 'Duke', '99.6'],
  [''],
  ['S52'],
  ['1', '5*', 'OUT', 'Twin Name', 'X', 'Duke'],
  ['2', '5*', 'IN', 'Nobody Known', 'X', 'Nowhere U'],
  [''],
  ['S75'],
  ['1', '5*', 'SF', 'Ethan Campbell', '95', 'Duke', '99.5'],
  [''],
  ['S79'],
  ['1', '5*', 'SF', 'Future Guy', '94', '1 PROJ - UNC', '98.8'],
];
const portal = [
  ['S50', 'POS', 'Player', 'Old School', 'New School', 'Rating'],
  ['1', 'OUT', 'Ethan Campbell', 'Duke', 'North Carolina', ''],
  [''],
  ['S75'],
  ['1', 'PG', 'Ethan Campbell', 'North Carolina', 'Duke', '84'],
];

describe('parseRecruitingHistory', () => {
  it('reads each S section, skipping the all-time list, with X as no rating', () => {
    const s = parseRecruitingHistory(recruiting);
    expect(s.map(x => [x.season, x.rows.length])).toEqual([[52, 2], [75, 1], [79, 1]]);
    expect(s[0].rows[0]).toEqual({ rank: 1, stars: 5, pos: 'OUT', name: 'Twin Name', rating: null, school: 'Duke', consensus: null });
    expect(s[1].rows[0]).toMatchObject({ pos: 'SF', rating: 95, consensus: 99.5 });
  });
  it('throws on a bad rank', () => {
    expect(() => parseRecruitingHistory([['S52'], ['x', '5*', 'C', 'A B', 'X', 'Duke']])).toThrow(/rank/);
  });
});

describe('parseTransferHistory', () => {
  it('reads the season sections, including the header row that is also S50', () => {
    const s = parseTransferHistory(portal);
    expect(s.map(x => [x.season, x.rows.length])).toEqual([[50, 1], [75, 1]]);
    expect(s[1].rows[0]).toEqual({ rank: 1, pos: 'PG', name: 'Ethan Campbell', rating: 84, from: 'North Carolina', to: 'Duke' });
  });
});

describe('buildRecruitingHistory', () => {
  const build = () => {
    const report = new Report();
    const file = buildRecruitingHistory({ players, teams, tabs: { 'FBA JC Recruiting': recruiting, 'FBA JC Transfer Portal': portal } }, report);
    return { file, report };
  };
  it('keeps S78 and earlier, links unambiguous names and known schools, and leaves the rest as text', () => {
    const { file, report } = build();
    expect(file.classes.map(c => [c.season, c.recruits.length, c.portal.length])).toEqual([[50, 0, 1], [52, 2, 0], [75, 1, 1]]);
    expect(file.classes[2].recruits[0]).toMatchObject({ playerId: 'p00001', teamId: 'DUKE', school: 'Duke', rating: 95 });
    expect(file.classes[1].recruits[0].playerId).toBeNull();
    expect(file.classes[1].recruits[1]).toMatchObject({ teamId: null, school: 'Nowhere U' });
    expect(file.classes[2].portal[0]).toMatchObject({ fromTeamId: 'UNC', toTeamId: 'DUKE' });
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('Nowhere U'))).toBe(true);
    expect(JcRecruitingHistoryFile.safeParse(file).success).toBe(true);
  });
  it('plans the one doc', () => {
    const r = planJcRecruitingHistory({ players, teams, tabs: { 'FBA JC Recruiting': recruiting, 'FBA JC Transfer Portal': portal } }, new Report());
    expect(r.problems).toEqual([]);
    expect(r.docs.map(d => d[0])).toEqual(['leagues/fbajc/recruitingHistory.json']);
  });
});
