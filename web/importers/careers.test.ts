import { describe, expect, it } from 'vitest';
import { AwardCountsFile, type PlayerBiosFile, type PlayersFile, type SummaryFile } from '../engine/shared/types';
import { buildCareers, parseAwardsByPlayer, parseLeaguePpg, type AwardsByPlayerRow } from './careers';
import { Report } from './report';

const HEADER = ['MVP(S1)', '', 'ASG(S48)', '', 'ASG MVP(S48)', '', 'All-FBA T1(S48)', '', 'All-FBA T2(S48)', '', 'PPK Award(S57)', '', 'LP Award(S57)', '', 'MC Award(S57)', '', 'DPOY(S57)'];
const TAB11 = [
  HEADER,
  ['Paulo Pierre-Kent', '10.0', 'Payton Atkinson', '14.0', 'Akeem Naylor', '3.0', 'Akeem Naylor', '9.0', "Ignazio D'Angelo", '6.0', 'Timothy Cole', '6.0', 'Clyde King', '5.0', 'Darius Crewe', '5.0', 'Oluwatobiloba Jaramillo', '4.0'],
  ['Milo Machado', '7.0', 'Darius Crewe', '14.0', 'Haydon Burnett', '2.0', 'Timothy Cole', '8.0', 'Payton Atkinson', '5.0', 'Julien Shannon', '4.0', 'Akeem Naylor', '5.0', 'Keith Russell', '5.0', 'Jaylen Oden', '3.0'],
];

describe('parseAwardsByPlayer', () => {
  it('reads name and count pairs under each award column', () => {
    const rows = parseAwardsByPlayer(TAB11);
    expect(rows).toHaveLength(18);
    expect(rows[0]).toEqual({ key: 'MVP', name: 'Paulo Pierre-Kent', count: 10 });
    expect(rows).toContainEqual({ key: 'ALL_STAR', name: 'Darius Crewe', count: 14 });
    expect(rows).toContainEqual({ key: 'ALL_FBA_2', name: 'Payton Atkinson', count: 5 });
    expect(rows).toContainEqual({ key: 'DPOY', name: 'Jaylen Oden', count: 3 });
  });

  it('skips empty names', () => {
    const rows = parseAwardsByPlayer([['MVP(S1)', ''], ['', ''], ['Milo Machado', '7.0']]);
    expect(rows).toEqual([{ key: 'MVP', name: 'Milo Machado', count: 7 }]);
  });

  it('throws on an unknown header', () => {
    expect(() => parseAwardsByPlayer([['Dunk(S3)', ''], ['A B', '1']])).toThrow('Awards by player tab: unknown column "Dunk(S3)"');
  });
});

describe('parseLeaguePpg', () => {
  it('reads ranked lines and ignores the rest', () => {
    const rows = parseLeaguePpg(['S78 League PPG', '1. Harper Holland(98)(OAK): 43.4', '', "149. Koa'e Keano(66)(BOS): 3.4"].join('\n'));
    expect(rows).toEqual([
      { name: 'Harper Holland', teamId: 'OAK', ppg: 43.4 },
      { name: "Koa'e Keano", teamId: 'BOS', ppg: 3.4 },
    ]);
  });
});

const players: PlayersFile = {
  nextId: 5,
  players: {
    p00001: { id: 'p00001', name: 'Ann One', birthSeason: 50 },
    p00002: { id: 'p00002', name: 'Bob Two', birthSeason: 52 },
    p00003: { id: 'p00003', name: 'Cy Three', birthSeason: 55 },
    p00004: { id: 'p00004', name: 'Harper Holland', birthSeason: 60 },
  },
};
const bios: PlayerBiosFile = {
  league: 'fba',
  bios: [
    { playerId: 'p00001', born: 'Born-S50', entries: ['Duke-S46-S48', 'BOS-S49-S60', '6x All-Star', '1x MVP'] },
    { playerId: 'p00002', born: 'Born-S52', entries: ['BOS-S49-S60', '3x MVP'] },
  ],
};
const summary = (season: number, extra: Partial<SummaryFile> = {}): SummaryFile => ({ league: 'fba', season, locked: true, host: null, champions: [], ...extra });
const row = (key: AwardsByPlayerRow['key'], name: string, count: number): AwardsByPlayerRow => ({ key, name, count });
const careersLines = (r: Report) => r.entries.filter(e => e.topic === 'careers').map(e => `${e.level}: ${e.message}`);

describe('buildCareers', () => {
  it('gives no line where the bio agrees with tab 11 and writes the bio sum', () => {
    const report = new Report();
    const out = buildCareers({ players, bios, summaries: [], tab11: [row('ALL_STAR', 'Ann One', 6), row('MVP', 'Ann One', 1)], ppg: [] }, report);
    expect(out.awardCounts.counts).toContainEqual({ playerId: 'p00001', key: 'ALL_STAR', count: 6 });
    expect(careersLines(report).filter(l => l.includes('Ann One') && l.includes('tab 11'))).toEqual([]);
  });

  it('warns when the bio and tab 11 differ by 2 or more and keeps the bio count', () => {
    const report = new Report();
    const out = buildCareers({ players, bios, summaries: [], tab11: [row('ALL_STAR', 'Ann One', 6), row('MVP', 'Ann One', 3)], ppg: [] }, report);
    expect(out.awardCounts.counts).toContainEqual({ playerId: 'p00001', key: 'MVP', count: 1 });
    expect(report.entries).toContainEqual({ level: 'warn', topic: 'careers', message: 'Ann One MVP: bio 1, tab 11 3' });
  });

  it('reports a difference of 1 as info and 0 against 1 as a warning', () => {
    const report = new Report();
    buildCareers({ players, bios, summaries: [], tab11: [row('ALL_STAR', 'Ann One', 7), row('MVP', 'Ann One', 1), row('MVP', 'Bob Two', 2)], ppg: [] }, report);
    expect(report.entries).toContainEqual({ level: 'info', topic: 'careers', message: 'Ann One ALL_STAR: bio 6, tab 11 7' });
    expect(report.entries).toContainEqual({ level: 'info', topic: 'careers', message: 'Bob Two MVP: bio 3, tab 11 2' });
    const zero = new Report();
    buildCareers({ players, bios, summaries: [], tab11: [row('MVP', 'Ann One', 1)], ppg: [] }, zero);
    expect(zero.entries).toContainEqual({ level: 'warn', topic: 'careers', message: 'Ann One ALL_STAR: bio 6, tab 11 0' });
  });

  it('checks the bio against the summaries', () => {
    const report = new Report();
    const summaries = [summary(60, { awards: [{ award: 'MVP', playerId: 'p00002', teamId: 'BOS' }] }), summary(61, { awards: [{ award: 'MVP', playerId: 'p00002', teamId: 'BOS' }] })];
    buildCareers({ players, bios, summaries, tab11: [row('MVP', 'Bob Two', 3)], ppg: [] }, report);
    expect(report.entries).toContainEqual({ level: 'info', topic: 'careers', message: 'Bob Two MVP: bio 3, summaries 2' });
  });

  it('warns on 0 against a positive count in the summaries', () => {
    const report = new Report();
    const summaries = [summary(60, { awards: [{ award: 'DPOY', playerId: 'p00002', teamId: 'BOS' }] })];
    buildCareers({ players, bios, summaries, tab11: [], ppg: [] }, report);
    expect(report.entries).toContainEqual({ level: 'warn', topic: 'careers', message: 'Bob Two DPOY: bio 0, summaries 1' });
  });

  it('uses tab 11 for a player without a bio and the summaries for the rest', () => {
    const summaries = [summary(60, { awards: [{ award: 'ROTY', playerId: 'p00003', teamId: 'BOS' }] })];
    const out = buildCareers({ players, bios, summaries, tab11: [row('MVP', 'Cy Three', 2)], ppg: [] }, new Report());
    const mine = out.awardCounts.counts.filter(c => c.playerId === 'p00003');
    expect(mine).toEqual([{ playerId: 'p00003', key: 'MVP', count: 2 }, { playerId: 'p00003', key: 'ROTY', count: 1 }]);
  });

  it('warns about unmatched tab 11 names, lists unparsed bio entries once and ends with a count', () => {
    const report = new Report();
    const withOther: PlayerBiosFile = {
      league: 'fba',
      bios: [{ playerId: 'p00001', born: 'Born-S50', entries: ['Mystery entry'] }, { playerId: 'p00002', born: 'Born-S52', entries: ['Mystery entry'] }],
    };
    buildCareers({ players, bios: withOther, summaries: [], tab11: [row('MVP', 'Nobody Here', 2)], ppg: [] }, report);
    const lines = careersLines(report);
    expect(lines).toContain('warn: Unmatched: Nobody Here (tab 11 MVP)');
    expect(lines.filter(l => l === 'info: Unparsed bio entry: Mystery entry')).toHaveLength(1);
    expect(lines[lines.length - 1]).toMatch(/^info: \d+ info, \d+ warnings$/);
  });

  it('sorts counts by player and award order, and the output passes the schema', () => {
    const out = buildCareers({ players, bios, summaries: [], tab11: [row('DPOY', 'Cy Three', 1), row('ALL_STAR', 'Cy Three', 4), row('MVP', 'Cy Three', 2)], ppg: [] }, new Report());
    expect(AwardCountsFile.safeParse(out.awardCounts).success).toBe(true);
    expect(out.awardCounts.throughSeason).toBe(78);
    expect(out.awardCounts.counts.filter(c => c.playerId === 'p00003').map(c => c.key)).toEqual(['MVP', 'DPOY', 'ALL_STAR']);
    const ids = out.awardCounts.counts.map(c => c.playerId);
    expect(ids).toEqual([...ids].sort());
  });

  it('writes legacyPpg onto S78 in file order and skips unmatched names', () => {
    const report = new Report();
    const out = buildCareers({
      players, bios, summaries: [summary(77), summary(78)], tab11: [],
      ppg: [{ name: 'Harper Holland', teamId: 'OAK', ppg: 43.4 }, { name: 'Ghost Player', teamId: 'BOS', ppg: 5 }, { name: 'Ann One', teamId: 'BOS', ppg: 12.5 }],
    }, report);
    expect(out.s78?.legacyPpg).toEqual([{ playerId: 'p00004', teamId: 'OAK', ppg: 43.4 }, { playerId: 'p00001', teamId: 'BOS', ppg: 12.5 }]);
    expect(report.entries).toContainEqual({ level: 'warn', topic: 'careers', message: 'Unmatched: Ghost Player (S78 PPG)' });
  });

  it('gives no S78 when there is no S78 summary', () => {
    const out = buildCareers({ players, bios, summaries: [summary(77)], tab11: [], ppg: [] }, new Report());
    expect(out.s78).toBeNull();
  });
});
