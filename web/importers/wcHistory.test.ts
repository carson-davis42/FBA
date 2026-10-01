import { describe, expect, it } from 'vitest';
import type { PlayersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { Report } from './report';
import { buildWcHistory } from './wcHistory';

const badge = { bg: '#000', fg: '#fff' };
const team = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: null, logoFolder: null, badge });
const teams: TeamsFile = { league: 'fbawc', teams: [team('ITA', 'Italy'), team('TUR', 'Turkey'), team('GER', 'Germany'), team('ENG', 'England'), team('USA', 'USA'), team('IND', 'India')] };
const players = { players: { p1: { id: 'p1', name: 'Rowan Hawthorne' } } } as unknown as PlayersFile;
const rows = [
  ['Year', 'Host City', 'Host Country', 'Champions', 'Runner-Up', 'Tournament MVP', 'Date'],
  ['S60', 'Manchester', 'England', 'USA', 'UK', 'Winston Holden', 'X'],
  ['S78', 'Zagreb', 'Croatia', 'Germany', 'Italy', 'Rowan Hawthorne', '2026-05-16'],
  ['S80', 'Mumbai', 'India'],
];

describe('buildWcHistory', () => {
  it('builds summaries, hosts and flags; the sheet wins ids and MVP, the existing text is kept', () => {
    const existing = new Map<number, SummaryFile>([[78, { league: 'fbawc', season: 78, locked: true, host: 'Croatia', champions: [{ title: 'World Cup Champion', champion: 'Germany', runnerUp: 'Italy', score: null }] }]]);
    const report = new Report();
    const out = buildWcHistory(rows, { players, teams, existing }, report);
    expect(out.summaries.map(s => s.season)).toEqual([60, 78]);
    expect(out.summaries[0].champions[0]).toMatchObject({ title: 'World Cup Champion', champion: 'USA', runnerUp: 'England', teamId: 'USA', runnerUpId: 'ENG', finalsMvp: null });
    expect(out.summaries[1]).toMatchObject({ host: 'Croatia', locked: true });
    expect(out.summaries[1].champions[0]).toMatchObject({ teamId: 'GER', runnerUpId: 'ITA', finalsMvp: 'p1', score: null });
    expect(out.hosts.hosts).toEqual([
      { season: 60, city: 'Manchester', country: 'England' }, { season: 78, city: 'Zagreb', country: 'Croatia' }, { season: 80, city: 'Mumbai', country: 'India' },
    ]);
    expect(out.teams.teams.find(t => t.teamId === 'GER')?.flag).toBe('de');
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('Winston Holden'))).toBe(true);
  });

  it('errors on a country the teams file does not have (host countries need not be teams)', () => {
    const report = new Report();
    buildWcHistory([rows[0], ['S62', 'Rome', 'Italy', 'Narnia', 'Italy', 'X', 'X']], { players, teams, existing: new Map() }, report);
    expect(report.count('error')).toBe(1);
  });
});
