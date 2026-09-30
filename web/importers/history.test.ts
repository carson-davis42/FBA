import { describe, expect, it } from 'vitest';
import type { PastSeries, PlayersFile, SummaryFile, Team } from '../engine/shared/types';
import { PlayerBiosFile, SummaryFile as SummaryFileSchema } from '../engine/shared/types';
import { buildHistory, normName, type HistoryInput } from './history';
import { Report } from './report';
import type { AllFbaSeason, AwardsRow, ChampRow, StandingRow } from './sheets/history';

const badge = { bg: 'x', fg: 'y' };
const teams: Team[] = [
  { teamId: 'BOS', name: 'Boston Bucks', abbr: 'BOS', group: 'E', logoFolder: null, badge },
  { teamId: 'MEM', name: 'Memphis Blues', abbr: 'MEM', group: 'W', logoFolder: null, badge },
];
const players = (): PlayersFile => ({
  nextId: 3,
  players: {
    p00001: { id: 'p00001', name: 'Reagan Butler', birthSeason: 50 },
    p00002: { id: 'p00002', name: 'José Álvarez', birthSeason: 52 },
  },
});
const side = (name: string, seed: number) => ({ name, record: null, seed });
const series = (id: string, round: number, home: string | null, away: string | null, hw: number, aw: number): PastSeries => ({
  id, round, home: home ? side(home, 1) : null, away: away ? side(away, 2) : null, homeWins: hw, awayWins: aw, winner: hw > aw ? 'home' : 'away',
});
// 2 rounds: Boston beat Memphis in the final, 4-1.
const bracket2 = (season = 78) => ({
  season,
  rounds: 2,
  series: [
    series('R1-1', 1, 'Boston Bucks', 'Atlanta Venom', 4, 0),
    series('R1-2', 1, 'Memphis Blues', 'Denver X', 4, 2),
    series('R2-1', 2, 'Boston Bucks', 'Memphis Blues', 4, 1),
  ],
});
const champ = (season: number, over: Partial<ChampRow> = {}): ChampRow => ({
  season, champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4–1', finalsMvp: 'Reagan Butler', ...over,
});
const emptyAwards = (season: number, over: Partial<AwardsRow> = {}): AwardsRow => ({
  season, west: null, east: null, awards: {}, asgWinner: null, asgLoser: null, asgMvp: null, ysgWinner: null, ysgMvp: null, fivePoint: null, dunk: null, ...over,
});
const input = (over: Partial<HistoryInput> = {}): HistoryInput => ({
  players: players(),
  teams,
  existing: new Map(),
  champs: [],
  awards: [],
  allFba: [],
  standings: new Map(),
  bios: [],
  brackets: [],
  ...over,
});
const run = (i: HistoryInput) => {
  const report = new Report();
  const out = buildHistory(i, report);
  return { ...out, report };
};
const warnings = (r: Report, topic: string) => r.entries.filter(e => e.level === 'warn' && e.topic === topic).map(e => e.message);

describe('normName', () => {
  it('trims, straightens apostrophes, strips accents and lowercases', () => {
    expect(normName('  José D’Arcy ')).toBe("jose d'arcy");
  });
});

describe('players', () => {
  it('links an existing player, adds a new one with the next id and birth season, and sorts bios by id', () => {
    const r = run(input({
      bios: [
        { name: 'New Guy', born: 'Born-S61', entries: ['S61 drafted'] },
        { name: 'jose alvarez', born: 'Born-S52', entries: ['x'] },
      ],
    }));
    expect(r.players.players.p00003).toEqual({ id: 'p00003', name: 'New Guy', birthSeason: 61 });
    expect(r.players.nextId).toBe(4);
    expect(r.bios.bios.map(b => b.playerId)).toEqual(['p00002', 'p00003']);
    expect(PlayerBiosFile.safeParse(r.bios).success).toBe(true);
  });

  it('gives a null birth season for an FFL birth', () => {
    const r = run(input({ bios: [{ name: 'Old Timer', born: 'Born-FFL S1(-53)', entries: [] }] }));
    expect(r.players.players.p00003.birthSeason).toBeNull();
  });

  it('does not change the input players file', () => {
    const p = players();
    run(input({ players: p, bios: [{ name: 'New Guy', born: 'Born-S61', entries: [] }] }));
    expect(p).toEqual(players());
  });

  it('renames a matched player to the Players-tab spelling and reports it', () => {
    const r = run(input({ bios: [{ name: 'Jose Alvarez', born: 'Born-S52', entries: [] }] }));
    expect(r.players.players.p00002.name).toBe('Jose Alvarez');
    expect(r.report.entries.filter(e => e.level === 'info' && e.topic === 'names').map(e => e.message)).toEqual(['Renamed: José Álvarez → Jose Alvarez']);
    const again = run(input({ players: r.players, bios: [{ name: 'Jose Alvarez', born: 'Born-S52', entries: [] }] }));
    expect(again.report.entries.filter(e => e.topic === 'names')).toEqual([]);
    expect(again.players).toEqual(r.players);
  });

  it('reports an ambiguous name and writes no bio', () => {
    const p = players();
    p.players.p00003 = { id: 'p00003', name: 'Reagan  Butler'.replace('  ', ' '), birthSeason: 60 };
    p.nextId = 4;
    const r = run(input({ players: p, bios: [{ name: 'Reagan Butler', born: 'Born-S50', entries: [] }] }));
    expect(warnings(r.report, 'names')).toContain('Ambiguous: Reagan Butler');
    expect(r.bios.bios).toEqual([]);
    expect(Object.keys(r.players.players)).toHaveLength(3);
  });
});

describe('seasons', () => {
  it('merges S78: keeps the extra champion entry, rewrites the score and adds the Finals MVP', () => {
    const existing: SummaryFile = {
      league: 'fba', season: 78, locked: false, host: null,
      champions: [
        { title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' },
        { title: 'Extra Champion', champion: 'Somebody', runnerUp: null, score: null, group: 'X' },
      ],
    };
    const r = run(input({ existing: new Map([[78, existing]]), champs: [champ(78)] }));
    const s78 = r.summaries.find(s => s.season === 78)!;
    expect(s78.champions).toHaveLength(2);
    expect(s78.champions[0]).toMatchObject({ title: 'FBA Champion', score: '4–1', finalsMvp: 'p00001', teamId: 'BOS', runnerUpId: 'MEM' });
    expect(s78.champions[1].title).toBe('Extra Champion');
    expect(s78.locked).toBe(true);
    expect(s78.host).toBeNull();
  });

  it('keeps an existing FBA Champion entry when the sheet has no row', () => {
    const existing: SummaryFile = {
      league: 'fba', season: 77, locked: false, host: 'h',
      champions: [{ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: null, score: '4-0' }],
    };
    const r = run(input({ existing: new Map([[77, existing]]) }));
    const s = r.summaries.find(x => x.season === 77)!;
    expect(s.champions).toEqual(existing.champions);
    expect(s.awards).toEqual([]);
    expect(s.confChampions).toBeNull();
    expect(s.allStar).toBeNull();
    expect(s.host).toBe('h');
  });

  it('produces summaries for S1-S78 only', () => {
    const existing: SummaryFile = { league: 'fba', season: 79, locked: false, host: null, champions: [] };
    const r = run(input({ existing: new Map([[79, existing]]), champs: [champ(79)] }));
    expect(r.summaries).toHaveLength(78);
    expect(r.summaries.map(s => s.season)).toEqual(Array.from({ length: 78 }, (_, i) => i + 1));
    for (const s of r.summaries) expect(SummaryFileSchema.safeParse(s).success).toBe(true);
  });

  it('leaves a champion without a matching team unlinked', () => {
    const r = run(input({ champs: [champ(5, { champion: 'Former Pirates', runnerUp: 'Old Wolves' })] }));
    const c = r.summaries[4].champions[0];
    expect(c.teamId).toBeUndefined();
    expect(c.runnerUpId).toBeUndefined();
  });
});

describe('awards and All-FBA', () => {
  it('resolves awards, conference champions and the All-Star weekend', () => {
    const r = run(input({
      awards: [emptyAwards(78, {
        west: 'Memphis Blues', east: 'Boston Bucks',
        awards: { MIP: { name: 'Reagan Butler', team: 'HON' }, MVP: { name: 'Jose Alvarez', team: null } },
        asgMvp: { name: 'Reagan Butler', team: 'HON' },
        ysgWinner: 'Team Akeem Naylor',
      })],
    }));
    const s = r.summaries[77];
    expect(s.awards).toEqual([
      { award: 'MVP', playerId: 'p00002', teamId: '?' },
      { award: 'MIP', playerId: 'p00001', teamId: 'HON' },
    ]);
    expect(s.confChampions).toEqual({ E: 'Boston Bucks', W: 'Memphis Blues' });
    expect(s.allStar).toEqual({
      allStars: [], youngStars: [], asgMvp: 'p00001', fivePoint: null, dunk: null,
      asgWinner: null, asgLoser: null, ysgWinner: 'Team Akeem Naylor', ysgMvp: null,
    });
  });

  it('gives a null allStar when every value is empty', () => {
    const r = run(input({ awards: [emptyAwards(10, { west: 'A', east: 'B' })] }));
    expect(r.summaries[9].allStar).toBeNull();
    expect(r.summaries[9].awards).toEqual([]);
  });

  it('reports and skips an unknown award winner', () => {
    const r = run(input({ awards: [emptyAwards(9, { awards: { ROTY: { name: 'Nobody Here', team: 'AAA' } } })] }));
    expect(r.summaries[8].awards).toEqual([]);
    expect(warnings(r.report, 'names')).toEqual(['Unmatched: Nobody Here (S9 ROTY)']);
  });

  it('looks up the whole cell first, so a hyphenated surname is not read as a team', () => {
    const p = players();
    p.players.p00003 = { id: 'p00003', name: 'Paulo Pierre-Kent', birthSeason: 60 };
    p.nextId = 4;
    const r = run(input({ players: p, awards: [emptyAwards(9, { awards: { ROTY: { name: 'Paulo Pierre', team: 'Kent' } } })] }));
    expect((r.summaries[8].awards ?? []).map(a => a.playerId)).toEqual(['p00003']);
    expect(warnings(r.report, 'names')).toEqual([]);
  });

  it('resolves a Finals MVP written as Name-TEAM', () => {
    const r = run(input({ champs: [champ(9, { finalsMvp: 'Reagan Butler-HON' })] }));
    expect(r.summaries[8].champions[0].finalsMvp).toBe('p00001');
    expect(warnings(r.report, 'names')).toEqual([]);
  });

  it('resolves All-FBA lines and keeps the slot order when a name is unknown', () => {
    const allFba: AllFbaSeason = {
      season: 58,
      slots: ['OUT', 'MID', 'M2', 'IN'],
      team1: [{ name: 'Reagan Butler', team: 'HON' }, { name: 'Jose Alvarez', team: 'CGG' }, { name: 'Ghost Player', team: 'ZZ' }, null],
      team2: [null, null, null, null],
    };
    const r = run(input({ allFba: [allFba] }));
    const a = r.summaries[57].allFba!;
    expect(a.team1).toEqual([
      { slot: 'OUT', playerId: 'p00001', teamId: 'HON' },
      { slot: 'MID', playerId: 'p00002', teamId: 'CGG' },
      { slot: 'M2', playerId: null, teamId: null },
      { slot: 'IN', playerId: null, teamId: null },
    ]);
    expect(a.team2.map(s => s.slot)).toEqual(['OUT', 'MID', 'M2', 'IN']);
    expect(warnings(r.report, 'names')).toEqual(['Unmatched: Ghost Player (S58 All-FBA team 1 M2)']);
    expect(SummaryFileSchema.safeParse(r.summaries[57]).success).toBe(true);
  });
});

describe('standings and brackets', () => {
  const standings: StandingRow[] = [
    { group: 'E', rank: 1, name: 'Boston Bucks', w: 60, l: 26 },
    { group: 'E', rank: 2, name: 'Atlanta Venom', w: 50, l: 36 },
    { group: 'W', rank: 1, name: 'Memphis Blues', w: 58, l: 28 },
    { group: 'W', rank: 2, name: 'Utah Nobody', w: 30, l: 56 },
  ];

  it('derives playoff rounds from a 2-round bracket and links current teams', () => {
    const r = run(input({ champs: [champ(78)], standings: new Map([[78, standings]]), brackets: [bracket2()] }));
    const s = r.summaries[77];
    expect(s.pastBracket).toEqual({ rounds: 2, series: bracket2().series });
    const by = Object.fromEntries((s.standings ?? []).map(x => [x.name, x]));
    expect(by['Boston Bucks']).toMatchObject({ teamId: 'BOS', group: 'E', rank: 1, w: 60, l: 26, confW: null, confL: null, diff: null, marker: null, seed: null, playoff: { round: 2, champion: true } });
    expect(by['Memphis Blues'].playoff).toEqual({ round: 2, champion: false });
    expect(by['Atlanta Venom']).toMatchObject({ teamId: 'Atlanta Venom', playoff: { round: 1, champion: false } });
    expect(by['Utah Nobody'].playoff).toBeNull();
    expect(SummaryFileSchema.safeParse(s).success).toBe(true);
    expect(s.locked).toBe(true);
  });

  it('uses the champion and runner-up when there is no bracket', () => {
    const r = run(input({ champs: [champ(78)], standings: new Map([[78, standings]]) }));
    const by = Object.fromEntries((r.summaries[77].standings ?? []).map(x => [x.name, x.playoff]));
    expect(by['Boston Bucks']).toEqual({ round: 4, champion: true });
    expect(by['Memphis Blues']).toEqual({ round: 4, champion: false });
    expect(by['Utah Nobody']).toBeNull();
    expect(r.summaries[77].pastBracket).toBeNull();
  });

  it('clears a stale bracket when the season no longer has one', () => {
    const first = run(input({ champs: [champ(78)], brackets: [bracket2()] }));
    expect(first.summaries[77].pastBracket).not.toBeNull();
    const second = run(input({ champs: [champ(78)], existing: new Map(first.summaries.map(s => [s.season, s])) }));
    expect(second.summaries[77].pastBracket).toBeNull();
  });

  it('reports a bracket side that matches no standings row, and resolves the Denver Height alias', () => {
    const rows: StandingRow[] = [
      { group: 'E', rank: 1, name: 'Boston Bucks', w: 60, l: 26 },
      { group: 'W', rank: 1, name: 'Denver Heights', w: 40, l: 46 },
    ];
    const b = {
      season: 78, rounds: 2,
      series: [
        series('R1-1', 1, 'Boston Bucks', 'Denver Height', 4, 2),
        series('R1-2', 1, 'Memphis Blues', 'Ghost Town', 4, 0),
        series('R2-1', 2, 'Boston Bucks', 'Memphis Blues', 4, 1),
      ],
    };
    const r = run(input({ champs: [champ(78)], standings: new Map([[78, rows]]), brackets: [b] }));
    const by = Object.fromEntries((r.summaries[77].standings ?? []).map(x => [x.name, x.playoff]));
    expect(by['Denver Heights']).toEqual({ round: 1, champion: false });
    expect(warnings(r.report, 'brackets')).toEqual([
      'S78: bracket team "Memphis Blues" is not in the standings',
      'S78: bracket team "Ghost Town" is not in the standings',
    ]);
  });

  it('sets empty standings and warns for S71-S78 when the sheet has no rows', () => {
    const existing: SummaryFile = {
      league: 'fba', season: 75, locked: true, host: null, champions: [],
      standings: [{ teamId: 'BOS', name: 'Boston Bucks', group: 'E', rank: 1, w: 1, l: 1, confW: null, confL: null, diff: null, marker: null, seed: null, playoff: null }],
    };
    const r = run(input({ existing: new Map([[75, existing]]) }));
    expect(r.summaries[74].standings).toEqual([]);
    expect(r.summaries[0].standings).toBeUndefined();
    expect(warnings(r.report, 'standings')).toHaveLength(8);
    expect(warnings(r.report, 'standings')[0]).toBe('S71: no standings rows in the sheet');
  });

  it('reports a final that disagrees with the sheet and still writes the bracket', () => {
    const r = run(input({ champs: [champ(78, { champion: 'Memphis Blues', runnerUp: 'Boston Bucks' })], brackets: [bracket2()] }));
    expect(warnings(r.report, 'brackets')).toEqual(['S78: final Boston Bucks 4–1 Memphis Blues vs sheet Memphis Blues 4–1 Boston Bucks']);
    expect(r.summaries[77].pastBracket).not.toBeNull();
  });

  it('reports a score mismatch', () => {
    const r = run(input({ champs: [champ(78, { score: '4–3' })], brackets: [bracket2()] }));
    expect(warnings(r.report, 'brackets')).toEqual(['S78: final Boston Bucks 4–1 Memphis Blues vs sheet Boston Bucks 4–3 Memphis Blues']);
  });

  it('is quiet when the final matches, and notes seasons without a bracket', () => {
    const r = run(input({ champs: [champ(78)], brackets: [bracket2()] }));
    expect(warnings(r.report, 'brackets')).toEqual([]);
    const infos = r.report.entries.filter(e => e.level === 'info' && e.topic === 'brackets').map(e => e.message);
    expect(infos).toContain('No bracket: S1');
    expect(infos).not.toContain('No bracket: S78');
  });
});

describe('idempotence', () => {
  it('gives the same output when run again on its own output', () => {
    const i = input({
      champs: [champ(78), champ(5, { champion: 'Former Pirates', runnerUp: null, score: null, finalsMvp: 'Ghost' })],
      awards: [emptyAwards(78, { west: 'Memphis Blues', east: 'Boston Bucks', awards: { MVP: { name: 'Reagan Butler', team: 'HON' } }, ysgMvp: { name: 'New Guy', team: 'X' } })],
      standings: new Map([[78, [{ group: 'E', rank: 1, name: 'Boston Bucks', w: 60, l: 26 } as StandingRow]]]),
      brackets: [bracket2()],
      bios: [{ name: 'New Guy', born: 'Born-S61', entries: ['a'] }, { name: 'Reagan Butler', born: 'Born-S50', entries: ['b'] }],
    });
    const first = run(i);
    const second = run({ ...i, players: first.players, existing: new Map(first.summaries.map(s => [s.season, s])) });
    expect(second.players).toEqual(first.players);
    expect(second.bios).toEqual(first.bios);
    expect(second.summaries).toEqual(first.summaries);
  });
});
