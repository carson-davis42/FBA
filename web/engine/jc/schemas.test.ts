import { describe, expect, it } from 'vitest';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import { Bracket, JcAwardsFile, JcPostseasonFile, JcRankingsFile, JcScheduleFile, ScheduleFile, SummaryFile } from '../shared/types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
const schedule = () => ({
  league: 'fbajc', season: 79, locked: false,
  tournaments: [{ id: 'T1', name: 'Alpha Classic', teams: ids(8) }],
  days: [
    { day: 1, kind: 'tournament', games: [{ gameNo: 1, home: 't0', away: 't1', tournament: 'T1' }] },
    { day: 2, kind: 'tournament', games: [] },
  ],
  drawKeys: { t0: 0.5 },
});
const rankings = () => ({ league: 'fbajc', season: 79, locked: false, snapshots: [{ afterDay: 0, order: ids(216) }] });

describe('JC schemas', () => {
  it('parses a valid schedule and rankings', () => {
    expect(JcScheduleFile.safeParse(schedule()).success).toBe(true);
    expect(JcRankingsFile.safeParse(rankings()).success).toBe(true);
  });

  it('rejects a tournament with 7 teams', () => {
    const s = schedule();
    s.tournaments[0].teams = ids(7);
    expect(JcScheduleFile.safeParse(s).success).toBe(false);
  });

  it('rejects a tournament with duplicate teams', () => {
    const s = schedule();
    s.tournaments[0].teams = [...ids(7), 't0'];
    expect(JcScheduleFile.safeParse(s).success).toBe(false);
  });

  it('rejects duplicate day numbers', () => {
    const s = schedule();
    s.days[1].day = 1;
    expect(JcScheduleFile.safeParse(s).success).toBe(false);
  });

  it('rejects a day outside 1..29 and a non-positive gameNo', () => {
    const a = schedule();
    a.days[1].day = 30;
    expect(JcScheduleFile.safeParse(a).success).toBe(false);
    const b = schedule();
    b.days[0].games[0].gameNo = 0;
    expect(JcScheduleFile.safeParse(b).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(JcScheduleFile.safeParse({ ...schedule(), extra: 1 }).success).toBe(false);
    expect(JcRankingsFile.safeParse({ ...rankings(), extra: 1 }).success).toBe(false);
  });
});

describe('JC paths', () => {
  it('routes fbajc schedule and rankings to the JC schemas', () => {
    expect(schemaForPath('leagues/fbajc/S79/schedule.json')).toBe(JcScheduleFile);
    expect(schemaForPath('leagues/fbajc/S79/rankings.json')).toBe(JcRankingsFile);
  });

  it('keeps fba/fbad2 schedule on the old schema and refuses rankings elsewhere', () => {
    expect(schemaForPath('leagues/fbad2/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fba/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fba/S79/rankings.json')).toBeNull();
    expect(schemaForPath('leagues/fbawc/S79/schedule.json')).toBeNull();
  });
});

describe('postseason schemas', () => {
  const game = (id: string, next: { id: string; side: 'home' | 'away' } | null, home: string | null, away: string | null) =>
    ({ id, round: 1, region: 0, home, away, homeSeed: null, awaySeed: null, next, result: null });
  const bracket = (id = 'B12') => ({
    id, kind: 'conf', name: id, champion: null,
    games: [game('G1', { id: 'F', side: 'home' }, 'a', 'b'), game('G2', { id: 'F', side: 'away' }, 'c', 'd'), game('F', null, null, null)],
  });
  const conf = () => Array.from({ length: 18 }, (_, i) => bracket(`C${i}`));
  const post = () => ({ league: 'fbajc', season: 79, locked: false, nextGameNo: 3133, conf: conf(), rsChampions: { C0: ['a'] }, field: null, nit: null, mm: null });

  it('parses a started postseason', () => {
    expect(JcPostseasonFile.safeParse(post()).success).toBe(true);
  });
  it('rejects 17 conference brackets', () => {
    expect(JcPostseasonFile.safeParse({ ...post(), conf: conf().slice(1) }).success).toBe(false);
  });
  it('rejects a bracket game whose next game does not exist, and two games feeding one slot', () => {
    const a = bracket();
    a.games[0].next = { id: 'NOPE', side: 'home' };
    expect(Bracket.safeParse(a).success).toBe(false);
    const b = bracket();
    b.games[1].next = { id: 'F', side: 'home' };
    expect(Bracket.safeParse(b).success).toBe(false);
  });
  it('rejects a champion who is not in the bracket, and a champion without a played final', () => {
    expect(Bracket.safeParse({ ...bracket(), champion: 'zz' }).success).toBe(false);
    expect(Bracket.safeParse({ ...bracket(), champion: 'a' }).success).toBe(false);
  });
  it('rejects a result whose teams differ from the game', () => {
    const b = bracket();
    (b.games[0] as { result: unknown }).result = { gameNo: 3133, home: 'a', away: 'x', homePts: 70, awayPts: 60 };
    expect(Bracket.safeParse(b).success).toBe(false);
  });
  it('rejects a tied result', () => {
    const b = bracket();
    (b.games[0] as { result: unknown }).result = { gameNo: 3133, home: 'a', away: 'b', homePts: 60, awayPts: 60 };
    expect(Bracket.safeParse(b).success).toBe(false);
  });
  const teams = (n: number, p = 't') => Array.from({ length: n }, (_, i) => `${p}${i}`);
  const field = () => ({
    mm: { teams: teams(64), seeds: {}, regions: [0, 1, 2, 3].map(r => teams(64).slice(r * 16, r * 16 + 16)) },
    nit: { teams: teams(32, 'n') }, warnings: [],
  });
  const mmBracket = () => ({ ...bracket('MM'), kind: 'mm' });
  const nitBracket = () => ({ ...bracket('NIT'), kind: 'nit' });
  it('accepts a field with both brackets and rejects broken fields', () => {
    const ok = { ...post(), field: field(), mm: mmBracket(), nit: nitBracket() };
    expect(JcPostseasonFile.safeParse(ok).success).toBe(true);
    expect(JcPostseasonFile.safeParse({ ...ok, mm: null }).success).toBe(false);
    const dup = field();
    dup.nit.teams[0] = 't0';
    expect(JcPostseasonFile.safeParse({ ...ok, field: dup }).success).toBe(false);
    const short = field();
    short.nit.teams = teams(31, 'n');
    expect(JcPostseasonFile.safeParse({ ...ok, field: short }).success).toBe(false);
    const regions = field();
    regions.mm.regions[3] = regions.mm.regions[3].slice(1);
    expect(JcPostseasonFile.safeParse({ ...ok, field: regions }).success).toBe(false);
  });

  const awards = () => ({
    league: 'fbajc', season: 79, locked: false,
    national: ['POY', 'FOY', 'GOY', 'FWD', 'COY', 'DPOY'].map(award => ({ award, playerId: null })),
    conference: Array.from({ length: 18 }, (_, i) => ({ conf: `C${i}`, playerId: null })),
    allAmerican: null, mvp: { mm: null, nit: null },
  });
  const aa = (offset = 0) => [1, 2, 3].map(team => ({
    team, slots: ['G', 'F', 'C', 'ANY', 'ANY'].map((slot, k) => ({ slot, playerId: `p${String(offset + team * 10 + k).padStart(5, '0')}` })),
  }));
  it('parses awards and rejects miscounts and wrong slot orders', () => {
    expect(JcAwardsFile.safeParse(awards()).success).toBe(true);
    expect(JcAwardsFile.safeParse({ ...awards(), national: awards().national.slice(1) }).success).toBe(false);
    expect(JcAwardsFile.safeParse({ ...awards(), conference: awards().conference.slice(1) }).success).toBe(false);
    expect(JcAwardsFile.safeParse({ ...awards(), allAmerican: aa() }).success).toBe(true);
    const wrong = aa();
    wrong[0].slots[0].slot = 'F';
    expect(JcAwardsFile.safeParse({ ...awards(), allAmerican: wrong }).success).toBe(false);
  });
  it('rejects the same player on two All-American teams', () => {
    const dup = aa();
    dup[1].slots[0].playerId = dup[0].slots[0].playerId;
    expect(JcAwardsFile.safeParse({ ...awards(), allAmerican: dup }).success).toBe(false);
  });

  it('keeps the college record to the FBAJC summary', () => {
    const jc = { confChampions: [], national: [], conference: [], allAmerican: null, mvp: { mm: null, nit: null }, nit: null };
    const base = { season: 79, locked: false, host: null, champions: [], jc };
    expect(SummaryFile.safeParse({ ...base, league: 'fbajc' }).success).toBe(true);
    expect(SummaryFile.safeParse({ ...base, league: 'fba' }).success).toBe(false);
  });

  it('routes the new documents', () => {
    expect(schemaForPath('leagues/fbajc/S79/postseason.json')).toBe(JcPostseasonFile);
    expect(schemaForPath('leagues/fbajc/S79/awards.json')).toBe(JcAwardsFile);
    expect(schemaForPath('leagues/fba/S79/awards.json')).not.toBe(JcAwardsFile);
    expect(schemaForPath('leagues/fbad2/S79/postseason.json')).toBeNull();
    expect(pathAgreementProblem('leagues/fbajc/S79/postseason.json', post())).toBeNull();
  });
});
