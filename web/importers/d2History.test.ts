import { describe, expect, it } from 'vitest';
import { D2DraftHistoryFile, D2LeagueHistoryFile, SummaryFile, type PlayersFile, type TeamsFile } from '../engine/shared/types';
import { buildD2History, buildLeagueHistory, d2LeagueMoves, D2_TABS } from './d2History';
import { Report } from './report';

const players: PlayersFile = {
  nextId: 5,
  players: {
    p00001: { id: 'p00001', name: 'Ann Able', birthSeason: null },
    p00002: { id: 'p00002', name: 'Bo Baker', birthSeason: null },
    p00003: { id: 'p00003', name: 'Cy Cole', birthSeason: null },
    p00004: { id: 'p00004', name: 'Di Dunn', birthSeason: null },
  },
};

const mkTeam = (id: string, name: string, group: string) => ({ teamId: id, name, abbr: id, group, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams: TeamsFile = { league: 'fbad2', teams: [mkTeam('t1', 'Hawks', 'PL'), mkTeam('t2', 'Owls', 'UL'), mkTeam('t3', 'Bears', 'PL')] };

const tabs: Record<string, string[][]> = {
  [D2_TABS.intl]: [
    ['Year', 'Champion', 'Runner-up', 'Series MVP'],
    ['S55(1)', 'Hawks', 'Owls', 'Ann Able'],
    ['S55(2)', 'Toronto', 'Bears', 'Nobody Known'],
  ],
  [D2_TABS.league]: [
    ['Year', 'PL Champion', '', '', 'UL Champion', '', ''],
    ['S69', 'Hawks', 'Bears', 'Bo Baker', 'Owls', 'Toronto', 'Cy Cole'],
  ],
  [D2_TABS.awardsEarly]: [
    ['Year', 'D2 MVP'],
    ['S55(1)', 'Ann Able-D2(Hawks)'],
    ['S55(2)', 'Di Dunn-D2(Toronto)'],
  ],
  [D2_TABS.awardsLate]: [
    ['Year', 'PL MVP', 'PL RS Champions'],
    ['S69', 'Bo Baker-D2(Hawks)', 'Hawks/Bears'],
  ],
};

const build = (existing = new Map(), report = new Report()) =>
  ({ report, ...buildD2History(tabs, {}, { players, teams, existing }, report) });

describe('buildD2History', () => {
  it('builds summaries for each season', () => {
    const { summaries, report } = build();
    expect(summaries.map(s => s.season)).toEqual([55, 69]);
    const s55 = summaries[0];
    expect(s55.champions.map(c => c.title)).toEqual(['D2 International Champion (1)', 'D2 International Champion (2)']);
    expect(s55.champions[0]).toMatchObject({ champion: 'Hawks', runnerUp: 'Owls', score: null, group: 'D2', finalsMvp: 'p00001', teamId: 't1', runnerUpId: 't2' });
    expect(s55.champions[1].teamId).toBeUndefined();
    expect(s55.champions[1].runnerUpId).toBe('t3');
    expect(s55.champions[1].finalsMvp).toBeNull();
    expect(s55.awards).toEqual([
      { award: 'MVP-D2', playerId: 'p00001', teamId: 't1' },
      { award: 'MVP-D2', playerId: 'p00004', teamId: 'Toronto' },
    ]);
    expect(s55.rsChampions).toBeUndefined();
    const s69 = summaries[1];
    expect(s69.champions.map(c => c.title)).toEqual(['Premier League Champion', 'United League Champion']);
    expect(s69.champions[0]).toMatchObject({ group: 'PL', teamId: 't1', runnerUpId: 't3', finalsMvp: 'p00002' });
    expect(s69.champions[1].runnerUpId).toBeUndefined();
    expect(s69.rsChampions).toEqual([{ group: 'PL', teams: ['Hawks', 'Bears'] }]);
    expect(s69.awards).toEqual([{ award: 'MVP-PL', playerId: 'p00002', teamId: 't1' }]);
    expect(report.entries.some(e => e.topic === 'd2-teams' && e.message.includes('Toronto'))).toBe(true);
  });

  it('merges into an existing summary, keeping its score', () => {
    const existing = new Map([[69, SummaryFile.parse({
      league: 'fbad2', season: 69, locked: true, host: null,
      champions: [{ title: 'Premier League Champion', champion: 'Hawks', runnerUp: 'Bears', score: '4-1' }],
    })]]);
    const { summaries } = build(existing);
    const c = summaries[1].champions;
    expect(c[0]).toMatchObject({ score: '4-1', group: 'PL', finalsMvp: 'p00002', teamId: 't1' });
    expect(c[1].title).toBe('United League Champion');
    expect(summaries[1].awards).toHaveLength(1);
  });

  it('a rebuild over its own output takes the sheet corrections but keeps the score text', () => {
    const first = build().summaries;
    const existing = new Map(first.map(s => [s.season, { ...s, champions: s.champions.map(c => ({ ...c, score: '4-0' })) }]));
    const fixed = { ...tabs, [D2_TABS.league]: [tabs[D2_TABS.league][0], ['S69', 'Hawks', 'Bears', 'Cy Cole', 'Owls', 'Toronto', 'Cy Cole']] };
    const rebuilt = buildD2History(fixed, {}, { players, teams, existing }, new Report()).summaries.find(s => s.season === 69)!;
    expect(rebuilt.champions[0].finalsMvp).toBe('p00003');
    expect(rebuilt.champions[0].score).toBe('4-0');
  });

  it('passes the schemas', () => {
    const { summaries, leagueHistory, drafts } = buildD2History(
      { ...tabs, [D2_TABS.leagues]: [['Hawks', 'Est: S50', 'PL: S50-pres.'], ['Owls', 'UL: S50-pres.'], ['Bears', 'PL: S50-pres.']] },
      { 'S70 D2': [['Team', 'Name', 'Pos', 'Age', 'Rating'], ['Hawks', 'Ann Able', 'PG', '19', ''], ['Toronto', 'Zed Zee', 'C', '20', '70']] },
      { players, teams, existing: new Map() }, new Report(),
    );
    for (const s of summaries) expect(SummaryFile.safeParse(s).success).toBe(true);
    expect(D2LeagueHistoryFile.safeParse(leagueHistory).success).toBe(true);
    expect(D2DraftHistoryFile.safeParse(drafts).success).toBe(true);
    expect(drafts.drafts[0].picks.map(p => [p.pick, p.teamId, p.playerId])).toEqual([[1, 't1', 'p00001'], [2, null, null]]);
  });
});

describe('buildLeagueHistory', () => {
  it('reports an unknown team and a missing team as errors', () => {
    const report = new Report();
    const out = buildLeagueHistory([['Hawks', 'PL: S50-pres.'], ['Ghosts', 'PL: S50-pres.']], teams, report);
    expect(out.teams.map(t => t.teamId)).toEqual(['t1']);
    const errors = report.entries.filter(e => e.level === 'error').map(e => e.message);
    expect(errors.some(m => m.includes('Ghosts'))).toBe(true);
    expect(errors.some(m => m.includes('Owls'))).toBe(true);
  });
});

describe('d2LeagueMoves', () => {
  const groups = ['PL', 'WL', 'UL', 'IL'];
  const big: TeamsFile = { league: 'fbad2', teams: Array.from({ length: 64 }, (_, i) => mkTeam(`t${String(i).padStart(2, '0')}`, `Team ${i}`, groups[Math.floor(i / 16)])) };
  const hist = (assign: (i: number) => string): D2LeagueHistoryFile => ({
    teams: big.teams.map((t, i) => ({ teamId: t.teamId, founded: null, spells: [{ group: assign(i) as 'PL', from: 68, to: null }] })),
  });

  it('lists the moved teams', () => {
    const h = hist(i => (i === 0 ? 'WL' : i === 16 ? 'PL' : groups[Math.floor(i / 16)]));
    const r = d2LeagueMoves(big, h);
    expect(r.problems).toEqual([]);
    expect(r.moves).toEqual([
      { teamId: 't00', name: 'Team 0', from: 'PL', to: 'WL' },
      { teamId: 't16', name: 'Team 16', from: 'WL', to: 'PL' },
    ]);
    expect(r.next.teams[0].group).toBe('WL');
    expect(r.next.teams[16].group).toBe('PL');
  });

  it('flags a league that would not have 16 teams', () => {
    const r = d2LeagueMoves(big, hist(i => (i === 16 ? 'PL' : groups[Math.floor(i / 16)])));
    expect(r.problems.length).toBeGreaterThan(0);
  });

  it('flags a history team that is not in teams.json', () => {
    const h = hist(i => groups[Math.floor(i / 16)]);
    h.teams.push({ teamId: 'zzz', founded: null, spells: [{ group: 'PL', from: 68, to: null }] });
    expect(d2LeagueMoves(big, h).problems.some(p => p.includes('not in teams.json'))).toBe(true);
  });

  it('flags a team with no open PL/WL/UL/IL spell', () => {
    const h = hist(i => groups[Math.floor(i / 16)]);
    h.teams[0].spells = [{ group: 'PL', from: 68, to: 75 }];
    expect(d2LeagueMoves(big, h).problems.some(p => p.includes('no open'))).toBe(true);
  });

  it('flags a missing team', () => {
    const h = hist(i => groups[Math.floor(i / 16)]);
    h.teams.pop();
    expect(d2LeagueMoves(big, h).problems.some(p => p.includes('no league history'))).toBe(true);
  });
});
