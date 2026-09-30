import { describe, expect, it } from 'vitest';
import { AwardCountsFile, type PlayersFile, type SummaryFile } from '../engine/shared/types';
import { Report } from './report';
import { planHistoryImport, type HistorySources } from './historyRun';

const players = (): PlayersFile => ({
  nextId: 152,
  players: {
    p00040: { id: 'p00040', name: 'Nadeem Akers', birthSeason: 50 },
    p00150: { id: 'p00150', name: 'Nadeem Akers', birthSeason: 56 },
    p00151: { id: 'p00151', name: 'Harper Holland', birthSeason: 60 },
  },
});
const entry = (playerId: string) => ({ playerId, position: 'PG', rating: 70, age: 25, points: 10 });
const roster = { league: 'fba', season: 78, locked: false, teams: { BOS: [entry('p00150'), entry('p00151')] } };
const badge = { bg: 'x', fg: 'y' };
const teamsDoc = { league: 'fba', teams: [{ teamId: 'BOS', name: 'Boston Bucks', abbr: 'BOS', group: 'E', logoFolder: null, badge }] };
const s78: SummaryFile = { league: 'fba', season: 78, locked: false, host: null, champions: [] };

const awardsHeader = ['Season', 'WC Champion', 'EC Champion', 'MVP', 'ROTY', 'PPK Award', 'LP Award', 'MC Award', 'DPOY', 'MIP',
  'ASG Winner', 'ASG Losing Captain', 'ASG MVP', 'YSG', 'YSG MVP', '5pt Contest', 'Dunk Contest'];
const awardsRow = awardsHeader.map(h => (h === 'Season' ? 'S78' : h === 'MVP' ? 'Harper Holland-BOS' : ''));

const sources = (over: Partial<HistorySources> = {}): HistorySources => ({
  docs: new Map<string, unknown>([
    ['players.json', players()],
    ['leagues/fba/teams.json', teamsDoc],
    ['leagues/fbad2/teams.json', { league: 'fbad2', teams: [] }],
    ['leagues/fba/S78/rosters.json', roster],
    ['leagues/fba/S78/summary.json', s78],
  ]),
  tabs: {
    'Championships': [['Season', '', 'Champion', 'Runner-up', '', 'Score', 'Finals MVP'], ['S78', '', 'Boston Bucks', 'Memphis Blues', '', '4-1', 'Harper Holland']],
    'Awards, Conference Titles, & AS': [awardsHeader, awardsRow],
    'All-FBA Teams': [],
    'Players': [['Nadeem Akers', 'Born-S50', 'BOS-S49-S60', '1x MVP'], ['Harper Holland', 'Born-S60', 'BOS-S78-S78']],
    'FBA Awards won by Player': [['MVP(S1)', ''], ['Nadeem Akers', '1']],
  },
  standingTabs: {},
  ppgText: ['S78 League PPG', '1. Harper Holland(98)(BOS): 43.4', '2. Nadeem Akers(80)(BOS): 30.1'].join('\n'),
  brackets: [],
  ...over,
});

const plan = (src: HistorySources) => {
  const report = new Report();
  const files = planHistoryImport(src, report);
  return { files, report, byPath: new Map(files) };
};

describe('planHistoryImport', () => {
  it('writes the merged docs, players, bios, S78 with PPG and the award counts', () => {
    const { files, byPath, report } = plan(sources());
    expect(report.hasErrors).toBe(false);
    const roster78 = JSON.stringify(byPath.get('leagues/fba/S78/rosters.json'));
    expect(roster78).toContain('p00040');
    expect(roster78).not.toContain('p00150');
    const pf = byPath.get('players.json') as PlayersFile;
    expect(pf.players.p00150).toBeUndefined();
    expect(pf.players.p00040.name).toBe('Nadeem Akers');
    const bios = byPath.get('leagues/fba/playerBios.json') as { bios: { playerId: string }[] };
    expect(bios.bios.map(b => b.playerId)).toEqual(['p00040', 'p00151']);
    const s = byPath.get('leagues/fba/S78/summary.json') as SummaryFile;
    expect(s.legacyPpg).toEqual([{ playerId: 'p00151', teamId: 'BOS', ppg: 43.4 }, { playerId: 'p00040', teamId: 'BOS', ppg: 30.1 }]);
    const counts = byPath.get('leagues/fba/awardCounts.json');
    expect(AwardCountsFile.safeParse(counts).success).toBe(true);
    expect(JSON.stringify(counts)).toContain('"playerId":"p00040","key":"MVP","count":1');
    expect(files.map(f => f[0]).filter(p => p === 'players.json')).toHaveLength(1);
    expect(files.filter(f => f[0] === 'leagues/fba/S78/summary.json')).toHaveLength(1);
    expect(files.filter(f => /summary\.json$/.test(f[0]))).toHaveLength(78);
  });

  it('writes players.json last, so a partial write never leaves a dangling id', () => {
    const { files } = plan(sources());
    expect(files[files.length - 1][0]).toBe('players.json');
    expect(files.filter(f => f[0] === 'players.json')).toHaveLength(1);
  });

  it('returns nothing when a schema check fails', () => {
    const bad = players();
    (bad.players.p00151 as { birthSeason: unknown }).birthSeason = 'x';
    const src = sources();
    src.docs.set('players.json', bad);
    const { files, report } = plan(src);
    expect(report.hasErrors).toBe(true);
    expect(files).toEqual([]);
  });
});
