import { describe, expect, it } from 'vitest';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { FreeAgentsFile, PicksFile, ReservesFile, RostersFile } from '../engine/shared/types';
import { assembleRefresh, type RefreshInputs } from './refresh';
import { Report } from './report';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
const team = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: 'E', logoFolder: null, badge });

function inputs(): RefreshInputs {
  return {
    season: 79,
    players: { nextId: 3, players: { p00001: { id: 'p00001', name: 'Rakeem Holloway', birthSeason: 59 }, p00002: { id: 'p00002', name: 'Ben Montgomery', birthSeason: 49 } } },
    fbaTeams: { league: 'fba', teams: [team('ATL', 'Atlanta Venom'), team('DCB', 'DCB'), team('OV', 'Ohio Valley Sharks')] },
    d2Teams: { league: 'fbad2', teams: [team('AMS', 'Amsterdam')] },
    fbaSheet: [
      { name: 'Atlanta Venom', country: null, players: [{ name: 'Rakeem Holloway', position: 'PF', age: 20, rating: 75, contractEnd: 79, contractAmount: 2, restricted: true }] },
      { name: 'DCB', country: null, players: [{ name: 'Keon Whitfield', position: 'SF', age: 24, rating: 80, contractEnd: 81, contractAmount: 5 }] },
      { name: 'Ohio Valley Sharks', country: null, players: [{ name: 'Callan Schwangau', position: 'PF', age: 28, rating: 68, contractEnd: 78, contractAmount: 1 }] },
    ],
    d2Sheet: [{ name: 'Amsterdam', country: 'Netherlands', players: [{ name: 'Ben Montgomery', position: 'PG', age: 30, rating: 75, contractEnd: null, contractAmount: null }] }],
    reserves: [{ name: 'Kris Dyer', position: 'PG', age: 30, rating: null, contractEnd: null, contractAmount: null }],
    freeAgents: [
      { name: 'Mubiru Okeke', position: 'SF', age: 28, rating: 69, note: '' },
      { name: 'Callan Schwangau', position: 'PF', age: 28, rating: 68, note: '' },
      { name: 'Milan Tepic', position: 'C', age: 22, rating: null, note: 'R' },
    ],
    picks: [
      { season: 80, owner: 'OV', originalTeam: 'DCB', originSeason: 75, condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, priority: 1 },
      { season: 81, owner: 'ATL', originalTeam: 'DCB', originSeason: 81, condition: { kind: 'none' }, originalCondition: { kind: 'none' }, priority: null },
    ],
  };
}

describe('assembleRefresh', () => {
  it('writes valid documents and keeps existing ids', () => {
    const files = assembleRefresh(inputs(), new Report());
    expect(Object.keys(files).sort()).toEqual([
      'leagues/fba/S79/freeAgents.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fba/picks.json',
      'leagues/fbad2/S79/reserves.json', 'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json', 'players.json',
    ]);
    for (const [rel, doc] of Object.entries(files)) expect(schemaForPath(rel)!.safeParse(doc).success, rel).toBe(true);
    const fba = files['leagues/fba/S79/rosters.json'] as RostersFile;
    expect(fba.teams.ATL.find(e => e.playerId === 'p00001')).toMatchObject({ restricted: true, contractEnd: 79 });
    expect((files['leagues/fbad2/S79/rosters.json'] as RostersFile).teams.AMS[0].playerId).toBe('p00002');
  });

  it('skips listed free agents who are on a roster and flags rookies', () => {
    const report = new Report();
    const fa = assembleRefresh(inputs(), report)['leagues/fba/S79/freeAgents.json'] as FreeAgentsFile;
    expect(fa.players.map(p => [p.position, p.rating, p.rookie, p.note])).toEqual([['SF', 69, false, ''], ['C', null, true, 'R']]);
    expect(report.entries.some(e => e.message.includes('Callan Schwangau') && e.message.includes('OV'))).toBe(true);
  });

  it('builds reserves and pick obligations', () => {
    const files = assembleRefresh(inputs(), new Report());
    expect((files['leagues/fbad2/S79/reserves.json'] as ReservesFile).players).toEqual([{ playerId: 'p00005', position: 'PG', age: 30, rating: null }]);
    expect((files['leagues/fba/picks.json'] as PicksFile).obligations).toEqual([
      { id: 'imp-S80-DCB-1', season: 80, originalTeam: 'DCB', owner: 'OV', condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, originSeason: 75, priority: 1, rolls: [], note: '' },
      { id: 'imp-S81-DCB-1', season: 81, originalTeam: 'DCB', owner: 'ATL', condition: { kind: 'none' }, originalCondition: { kind: 'none' }, originSeason: 81, priority: 1, rolls: [], note: '' },
    ]);
  });

  it('reports picks that name unknown teams', () => {
    const inp = inputs();
    inp.picks.push({ season: 82, owner: 'ZZZ', originalTeam: 'DCB', originSeason: 82, condition: { kind: 'none' }, originalCondition: { kind: 'none' }, priority: null });
    const report = new Report();
    assembleRefresh(inp, report);
    expect(report.entries.filter(e => e.level === 'error').map(e => e.message)).toEqual(['S82 pick ZZZ(via DCB): unknown team']);
  });
});
