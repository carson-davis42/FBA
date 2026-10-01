import { describe, expect, it } from 'vitest';
import type { PlayersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { SummaryFile as SummaryFileSchema } from '../engine/shared/types';
import { buildJcHistory, JC_LAST_SEASON, type JcParsed } from './jcHistory';
import { Report } from './report';

const team = (teamId: string, name: string, group: string) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: 'hsl(1 50% 36%)', fg: '#ffffff' } });
const teams: TeamsFile = {
  league: 'fbajc',
  teams: [
    team('DUKE', 'Duke', 'ACC'), team('UVA', 'Virginia', 'ACC'), team('TCU', 'TCU', 'B12'), team('KU', 'Kansas', 'B12'),
    team('KSU', 'Kansas State', 'B12'), team('ACU', 'Abeline Christian', 'SOCON'), team('SHU', 'Seton Hall', 'BE'),
    team('PUR', 'Purdue', 'B10'), team('FSU', 'Florida State', 'ACC'), team('SYR', 'Syracuse', 'ACC'), team('UNC', 'North Carolina', 'ACC'),
  ],
} as TeamsFile;
const players: PlayersFile = {
  nextId: 10,
  players: {
    p00001: { id: 'p00001', name: 'Charles Latley', birthSeason: null },
    p00002: { id: 'p00002', name: 'Rhys Creed', birthSeason: null },
    p00003: { id: 'p00003', name: 'Jaime Snow', birthSeason: null },
    p00004: { id: 'p00004', name: 'DeShawn Randall', birthSeason: null },
    p00005: { id: 'p00005', name: 'Trae York', birthSeason: null },
    p00006: { id: 'p00006', name: 'Twin Name', birthSeason: null },
    p00007: { id: 'p00007', name: 'Twin Name', birthSeason: null },
  },
} as unknown as PlayersFile;

const empty = (): JcParsed => ({ champions: [], nit: [], awards: [], allAmericans: [], confAwards: [], rsChampions: [], tourChampions: [], preseason: [] });
const run = (parsed: Partial<JcParsed>, existing: SummaryFile[] = []) => {
  const report = new Report();
  const out = buildJcHistory({ ...empty(), ...parsed }, { players, teams, existing: new Map(existing.map(s => [s.season, s])) }, report);
  return { out, report, season: (n: number) => out.find(s => s.season === n)! };
};

describe('buildJcHistory', () => {
  it('builds the national champion with ids, score and MVP', () => {
    const { season, report } = run({ champions: [{ season: 12, champion: 'Duke', runnerUp: 'TCU', score: '28-27', mvp: 'Charles Latley' }] });
    const s = season(12);
    expect(s).toMatchObject({ league: 'fbajc', season: 12, locked: true, host: null });
    expect(s.champions).toEqual([{ title: 'National Champion', champion: 'Duke', runnerUp: 'TCU', score: '28-27', teamId: 'DUKE', runnerUpId: 'TCU', finalsMvp: 'p00001' }]);
    expect(SummaryFileSchema.safeParse(s).success).toBe(true);
    expect(report.hasErrors).toBe(false);
  });

  it('makes a season for every sheet season and never writes S79 or later', () => {
    const { out, report } = run({ champions: [
      { season: 1, champion: 'Duke', runnerUp: 'Virginia', score: null, mvp: null },
      { season: 48, champion: 'Kansas', runnerUp: 'TCU', score: null, mvp: null },
      { season: JC_LAST_SEASON + 1, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: null },
    ] });
    expect(out.map(s => s.season)).toEqual([1, 48]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('S79'))).toBe(true);
  });

  it('adds the NIT champion and the NIT block from S72', () => {
    const { season } = run({
      champions: [{ season: 72, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: null }],
      nit: [{ season: 72, champion: 'Seton Hall', runnerUp: 'Purdue', mvp: 'Rhys Creed' }],
    });
    const s = season(72);
    expect(s.champions.map(c => c.title)).toEqual(['National Champion', 'NIT Champion']);
    expect(s.champions[1]).toMatchObject({ champion: 'Seton Hall', runnerUp: 'Purdue', teamId: 'SHU', runnerUpId: 'PUR', finalsMvp: 'p00002' });
    expect(s.jc!.nit).toEqual({ champion: 'SHU', runnerUp: 'PUR' });
    expect(s.jc!.mvp).toEqual({ mm: null, nit: 'p00002' });
    expect(SummaryFileSchema.safeParse(s).success).toBe(true);
  });

  it('keeps an MVP name as text when no player matches or two match', () => {
    const { season, report } = run({ champions: [
      { season: 5, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: 'Nobody Known' },
      { season: 6, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: 'Twin Name' },
    ] });
    expect(season(5).champions[0]).toMatchObject({ finalsMvp: null, mvpName: 'Nobody Known' });
    expect(season(5).jc!.mvp).toEqual({ mm: null, nit: null });
    expect(season(5).jc!.mvpNames).toEqual({ mm: 'Nobody Known', nit: null });
    expect(season(6).champions[0]).toMatchObject({ finalsMvp: null, mvpName: 'Twin Name' });
    expect(report.entries.filter(e => e.level === 'warn' && e.topic === 'jc-players').length).toBe(2);
  });

  it('reads sheet spelling variants through the alias maps', () => {
    const { season } = run({
      champions: [{ season: 60, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: null }],
      awards: [{ season: 60, award: 'POY', name: 'Deshawn Randall', school: 'Abilene Christian' }],
    });
    expect(season(60).jc!.national).toEqual([{ award: 'POY', playerId: 'p00004', teamId: 'ACU', name: 'Deshawn Randall', school: 'Abilene Christian' }]);
  });

  it('keeps an unresolved school as text and reports it', () => {
    const { season, report } = run({ champions: [{ season: 3, champion: 'Mystery U', runnerUp: 'Duke', score: null, mvp: null }] });
    expect(season(3).champions[0]).toMatchObject({ champion: 'Mystery U', runnerUpId: 'DUKE' });
    expect(season(3).champions[0].teamId).toBeUndefined();
    expect(report.entries.some(e => e.level === 'warn' && e.topic === 'jc-teams' && e.message.includes('Mystery U'))).toBe(true);
  });

  it('puts conference champions in as team ids with records for the regular-season champions', () => {
    const { season } = run({
      champions: [{ season: 53, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: null }],
      rsChampions: [
        { season: 53, conf: 'Big 12', school: 'Kansas', record: '12-3' },
        { season: 53, conf: 'Big 12', school: 'Kansas State', record: null },
        { season: 53, conf: 'ACC', school: 'Duke', record: '14-1' },
      ],
      tourChampions: [{ season: 53, conf: 'Big 12', school: 'Kansas' }],
    });
    const cc = season(53).jc!.confChampions;
    expect(cc.find(c => c.conf === 'B12')).toEqual({ conf: 'B12', tournament: 'KU', regularSeason: ['KU', 'KSU'], regularSeasonRecords: ['12-3', null] });
    expect(cc.find(c => c.conf === 'ACC')).toEqual({ conf: 'ACC', tournament: null, regularSeason: ['DUKE'], regularSeasonRecords: ['14-1'] });
    expect(SummaryFileSchema.safeParse(season(53)).success).toBe(true);
  });

  it('reports a conference name it does not know', () => {
    const { report } = run({
      champions: [{ season: 53, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: null }],
      tourChampions: [{ season: 53, conf: 'Imaginary League', school: 'Duke' }],
    });
    expect(report.entries.some(e => e.level === 'error' && e.message.includes('Imaginary League'))).toBe(true);
  });

  it('keeps old All-American layouts as written and S71 on in the current shape', () => {
    const { season } = run({
      champions: [53, 75].map(s => ({ season: s, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: null })),
      allAmericans: [
        { season: 53, teams: [{ team: 1, slots: [{ slot: 'OUT', name: 'Jaime Snow', school: 'Florida State' }, { slot: 'MID', name: 'Mystery Man', school: 'Duke' }] }] },
        { season: 75, teams: [1, 2, 3].map(team => ({ team, slots: ['G', 'F', 'C', 'ANY', 'ANY'].map((slot, i) => ({ slot, name: i === 0 && team === 1 ? 'Jaime Snow' : `Player ${team}${i}`, school: 'Kansas' })) })) },
      ],
    });
    const old = season(53).jc!;
    expect(old.allAmerican).toBeNull();
    expect(old.allAmericanLegacy!.teams[0].slots).toEqual([
      { slot: 'OUT', name: 'Jaime Snow', school: 'Florida State', playerId: 'p00003', teamId: 'FSU' },
      { slot: 'MID', name: 'Mystery Man', school: 'Duke', playerId: null, teamId: 'DUKE' },
    ]);
    const now = season(75).jc!;
    expect(now.allAmericanLegacy).toBeUndefined();
    expect(now.allAmerican!.map(t => t.slots.map(s => s.slot))).toEqual([['G', 'F', 'C', 'ANY', 'ANY'], ['G', 'F', 'C', 'ANY', 'ANY'], ['G', 'F', 'C', 'ANY', 'ANY']]);
    expect(now.allAmerican![0].slots[0]).toMatchObject({ playerId: 'p00003', name: 'Jaime Snow', school: 'Kansas', teamId: 'KU' });
    expect(SummaryFileSchema.safeParse(season(53)).success).toBe(true);
    expect(SummaryFileSchema.safeParse(season(75)).success).toBe(true);
  });

  it('carries national and conference awards and preseason champions', () => {
    const { season } = run({
      champions: [{ season: 64, champion: 'Duke', runnerUp: 'TCU', score: null, mvp: null }],
      awards: [{ season: 64, award: 'POY', name: 'Trae York', school: 'TCU' }],
      confAwards: [{ season: 64, conf: 'Big 12', name: 'Trae York', school: 'TCU' }],
      preseason: [{ season: 64, event: 'Maui Jim Invitational', champion: 'Kansas' }],
    });
    const jc = season(64).jc!;
    expect(jc.national[0]).toMatchObject({ award: 'POY', playerId: 'p00005', teamId: 'TCU' });
    expect(jc.conference[0]).toMatchObject({ conf: 'B12', playerId: 'p00005', teamId: 'TCU' });
    expect(jc.preseason).toEqual([{ event: 'Maui Jim Invitational', champion: 'Kansas', teamId: 'KU' }]);
  });

  it('merges into an existing summary, keeping its other fields and normalising the champion entry', () => {
    const existing = { league: 'fbajc', season: 78, locked: true, host: null, champions: [{ title: 'National Champion', champion: 'North Carolina', runnerUp: 'Syracuse', score: null }], pastBracket: { rounds: 1, series: [] } } as unknown as SummaryFile;
    const { season } = run({ champions: [{ season: 78, champion: 'North Carolina', runnerUp: 'Syracuse', score: '100-93', mvp: null }] }, [existing]);
    const s = season(78);
    expect(s.champions).toEqual([{ title: 'National Champion', champion: 'North Carolina', runnerUp: 'Syracuse', score: '100-93', teamId: 'UNC', runnerUpId: 'SYR', finalsMvp: null }]);
    expect((s as { pastBracket?: unknown }).pastBracket).toEqual({ rounds: 1, series: [] });
  });
});
