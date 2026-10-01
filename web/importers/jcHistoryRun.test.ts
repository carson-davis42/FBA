import { describe, expect, it } from 'vitest';
import type { PlayersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { JC_HISTORY_TABS, planJcHistory } from './jcHistoryRun';
import { Report } from './report';

const team = (teamId: string, name: string, group: string) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: 'hsl(1 50% 36%)', fg: '#ffffff' } });
const teams = { league: 'fbajc', teams: [team('DUKE', 'Duke', 'ACC'), team('UVA', 'Virginia', 'ACC'), team('UNC', 'North Carolina', 'ACC'), team('SYR', 'Syracuse', 'ACC')] } as TeamsFile;
const players = { nextId: 3, players: { p00001: { id: 'p00001', name: 'Charles Latley', birthSeason: null } } } as unknown as PlayersFile;

const tabs = (over: Record<string, string[][]> = {}): Record<string, string[][]> => ({
  [JC_HISTORY_TABS.champions]: [['Year', 'Champion', 'Runner-Up', 'Score', 'C-Ship MVP', 'Date'], ['', 'JC Era'], ['S1', 'Duke', 'Virginia', 'X', 'Charles Latley', 'X'], ['S78', 'North Carolina', 'Syracuse', '100-93', 'X', '2026-05-22'], ['S79', 'Duke', 'Virginia', 'X', 'X', 'X']],
  [JC_HISTORY_TABS.nit]: [['Year', 'Champion', 'Runner-Up', 'C-Ship MVP', 'Date']],
  [JC_HISTORY_TABS.awards]: [],
  [JC_HISTORY_TABS.confAwards]: [],
  [JC_HISTORY_TABS.rs.slice(0, 31)]: [['', 'ACC'], ['S53', 'Duke(14-1)']],
  [JC_HISTORY_TABS.tour]: [],
  [JC_HISTORY_TABS.pre]: [],
  ...over,
});
const plan = (t = tabs(), existing: SummaryFile[] = []) => {
  const report = new Report();
  const res = planJcHistory({ players, teams, existing: new Map(existing.map(s => [s.season, s])), tabs: t }, report);
  return { ...res, report };
};

describe('planJcHistory', () => {
  it('plans one validated summary per season, in the right folder, and never S79', () => {
    const { docs, problems } = plan();
    expect(problems).toEqual([]);
    expect(docs.map(d => d[0])).toEqual(['leagues/fbajc/S1/summary.json', 'leagues/fbajc/S53/summary.json', 'leagues/fbajc/S78/summary.json']);
  });
  it('reads the regular-season tab under its 31-character Excel name', () => {
    const { docs } = plan();
    const s53 = docs.find(d => d[0].includes('/S53/'))![1] as SummaryFile;
    expect(s53.jc!.confChampions[0]).toMatchObject({ conf: 'ACC', regularSeason: ['DUKE'], regularSeasonRecords: ['14-1'] });
  });
  it('reports a missing tab as an error and plans nothing', () => {
    const t = tabs(); delete t[JC_HISTORY_TABS.champions];
    const { docs, report } = plan(t);
    expect(docs).toEqual([]);
    expect(report.entries.some(e => e.level === 'error' && e.message.includes(JC_HISTORY_TABS.champions))).toBe(true);
  });
  it('returns schema problems instead of docs when a built summary is invalid', () => {
    const bad = { ...tabs(), [JC_HISTORY_TABS.champions]: [['S1', 'Duke', 'Virginia', 'X', 'X', 'X']] };
    const { docs, problems } = plan(bad, [{ league: 'fbajc', season: 1, locked: true, host: null, champions: [], players: [{ playerId: 'p00001', teamId: 'DUKE', stint: null } as never] } as SummaryFile]);
    expect(problems.length).toBeGreaterThan(0);
    expect(docs).toEqual([]);
  });
});
