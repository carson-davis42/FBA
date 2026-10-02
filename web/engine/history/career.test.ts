import { describe, it, expect } from 'vitest';
import type { AwardCountsFile, HallOfFameFile, SummaryFile, SummaryPlayerLine } from '../shared/types';
import { parseBio, bioAwardKey, careerAwardSums, summaryAwardCounts, liveCareer, careerLines, awardTotals, awardTotalsAll, careerStats, careerTotalsAll, careerSpan, playerStatus, applyPlacement } from './career';

describe('parseBio', () => {
  it('keeps one stint when a World Cup call-up sits between two stints with the same team', () => {
    const c = parseBio({ born: 'S56', entries: ['Clemson-S74-S75', 'Texas-S76-S77', '1x National Champion', 'D2(BUD)-S78-pres.', 'WC(HUN)-S78', 'D2(BUD)-S79-pres.', 'S79 MVP'] });
    expect(c.stints.map(s => `${s.kind}:${s.team}:${s.range}`)).toEqual(['college:Clemson:S74-S75', 'college:Texas:S76-S77', 'd2:D2(BUD):S78-pres.']);
    expect(c.nationalTeams.map(s => `${s.kind}:${s.team}:${s.range}`)).toEqual(['wc:WC(HUN):S78']);
    expect(c.stints[2].honours.map(h => h.label)).toEqual(['MVP']);
  });

  it('parses Akeem Naylor', () => {
    const c = parseBio({
      born: 'Born-S45',
      entries: ['Wake Forest-S63', 'S63 FOY', '1x All-American', '1x POY', '1x JP Award', '1x AAC POY', '1x AAC RS Champion', '1x AAC TOUR Champion',
        'CIN-S64-S69', '6x All-Star', '2x Young-Star', '3x All-FBA T1', '1x MVP', '1x LP Award', '2x ASG MVP',
        'MON-S70-S73', '4x All-FBA T1', '4x All-Star', '3x LP Award', '1x FBA C-Ship app.', '1x FBA Champion', '1x FBA C-Ship MVP', '1x ASG MVP',
        'OAK-S74-S77', '4x All-Star', '1x LP Award', '2x All-FBA T1', '2x WC Champion', '2x FBA C-Ship app.', '1x FBA Champion', '1x All-FBA T2', 'HOF-S77'],
    });
    expect(c.stints.filter(s => s.kind === 'college')).toHaveLength(1);
    expect(c.stints.filter(s => s.kind === 'fba')).toHaveLength(3);
    expect(c.hof).toBe('S77');
    expect(c.other).toEqual([]);
    expect(c.stints[0]).toMatchObject({ team: 'Wake Forest', range: 'S63', from: 63, to: 63 });
    expect(c.stints[0].honours[0]).toEqual({ label: 'FOY', count: 1, seasons: [63] });
    expect(c.stints[1]).toMatchObject({ team: 'CIN', range: 'S64-S69', from: 64, to: 69 });
    expect(careerAwardSums(c)).toEqual({
      ALL_STAR: 14, ALL_FBA_1: 9, LP: 5, ASG_MVP: 3, CHAMPION: 2, FINALS_MVP: 1, CONF_CHAMPION: 2, MVP: 1,
      YOUNG_STAR: 2, CSHIP_APP: 3, ALL_FBA_2: 1,
    });
  });

  it('parses Payton Atkinson', () => {
    const c = parseBio({
      born: 'Born-S46',
      entries: ['Alabama-S64', '1x NC app.', '1x All-American', '1x DH Award', '1x SEC RS Champion', '1x SEC TOUR Champion',
        'FLO-S65-S76', '12x All-Star', '2x Young-Star', '6x FBA C-Ship app.', '2x FBA Champion', '4x WC Champion', '1x MC Award', '1x All-FBA T1', '5x All-FBA T2',
        'NO-S77-S78', '2x All-Star', 'HOF-S78'],
    });
    expect(c.stints.map(s => s.kind)).toEqual(['college', 'fba', 'fba']);
    expect(c.hof).toBe('S78');
    const sums = careerAwardSums(c);
    expect(sums.ALL_STAR).toBe(14);
    expect(sums.CONF_CHAMPION).toBe(4);
    expect(sums.MC).toBe(1);
    expect(sums.ALL_FBA_2).toBe(5);
    expect(sums.CSHIP_APP).toBe(6);
  });

  it('parses Julien Shannon with a present stint', () => {
    const c = parseBio({ born: 'Born-S50', entries: ['New Mexico State-S66', '1x PAT POY', 'Creighton-S67', '1x BE POY', 'CP-S68-pres.', '2x Young-Star', '10x All-Star', '2x MVP'] });
    expect(c.stints.map(s => s.kind)).toEqual(['college', 'college', 'fba']);
    expect(c.stints[2]).toMatchObject({ team: 'CP', from: 68, to: 'pres', range: 'S68-pres.' });
    expect(careerAwardSums(c)).toEqual({ YOUNG_STAR: 2, ALL_STAR: 10, MVP: 2 });
  });

  it('parses single-season honours (Cameron Lučić)', () => {
    const c = parseBio({ born: 'Born-S51', entries: ['North Carolina-S69', 'DET-S70-pres.', '7x All-Star', 'S75 MIP'] });
    expect(c.stints[1].honours).toEqual([
      { label: 'All-Star', count: 7, seasons: [] },
      { label: 'MIP', count: 1, seasons: [75] },
    ]);
    expect(careerAwardSums(c)).toEqual({ ALL_STAR: 7, MIP: 1 });
  });

  it('merges equal single-season labels in one stint', () => {
    const c = parseBio({ born: 'Born-S1', entries: ['CIN-S64-S69', 'S65 MIP', 'S67 mip'] });
    expect(c.stints[0].honours).toEqual([{ label: 'MIP', count: 2, seasons: [65, 67] }]);
  });

  it('handles edge-case stints', () => {
    const ffl = parseBio({ born: 'Born-FFL', entries: ['SOX - FFL-FFL'] }).stints[0];
    expect(ffl).toMatchObject({ kind: 'fba', team: 'SOX', from: null, to: null, range: 'FFL-FFL' });
    const wc = parseBio({ born: 'Born-S1', entries: ['WC(Germany)-S56-S58;S62'] }).nationalTeams[0];
    expect(wc).toMatchObject({ kind: 'wc', team: 'WC(Germany)', from: 56, to: 62, range: 'S56-S58;S62' });
    expect(parseBio({ born: 'Born-S1', entries: ['D2(Milan)-S53-S56'] }).stints[0].kind).toBe('d2');
    expect(parseBio({ born: 'Born-S1', entries: ['FP/MON-S6-S25'] }).stints[0].kind).toBe('fba');
    expect(parseBio({ born: 'Born-S1', entries: ['?-S19-S34'] }).stints[0].kind).toBe('fba');
    for (const college of ['Duke-S60', 'UCLA-S60', 'BYU-S60', 'UConn-S60-S61'])
      expect(parseBio({ born: 'Born-S1', entries: [college] }).stints[0].kind).toBe('college');
  });

  it('keeps unmatched entries and orphan honours under other', () => {
    const c = parseBio({ born: 'Born-S1', entries: ['2x All-Star', 'Some note', 'CIN-S1-S2'] });
    expect(c.other).toEqual(['2x All-Star', 'Some note']);
    expect(c.stints).toHaveLength(1);
    expect(c.hof).toBeNull();
  });

  it('only counts FBA stints in the sums', () => {
    const c = parseBio({ born: 'Born-S1', entries: ['D2(Milan)-S53-S56', '3x All-Star', 'WC(Peru)-S57', '1x MVP', 'Wake Forest-S60', '1x MVP'] });
    expect(careerAwardSums(c)).toEqual({});
  });
});

describe('bioAwardKey', () => {
  it('maps labels case-insensitively', () => {
    expect(bioAwardKey('MVP')).toBe('MVP');
    expect(bioAwardKey('  fba champion ')).toBe('CHAMPION');
    expect(bioAwardKey('FBA C-Ship MVP')).toBe('FINALS_MVP');
    expect(bioAwardKey('ec champion')).toBe('CONF_CHAMPION');
    expect(bioAwardKey('WC Champion')).toBe('CONF_CHAMPION');
    expect(bioAwardKey('PPK Award')).toBe('PPK');
    expect(bioAwardKey('All-American')).toBeNull();
    expect(bioAwardKey('FIVE_POINT')).toBeNull();
  });
});

const totals = (g: number, pts: number) => ({ g, pts, def: 0, stops: 0, allowed: 0, exp: 0 });
function line(playerId: string, teamId: string | null, stint: number | null, g: number, pts: number, po?: [number, number]): SummaryPlayerLine {
  return { playerId, teamId, stint, position: 'SF', ratingStart: null, ratingEnd: null, rs: totals(g, pts), po: po ? totals(po[0], po[1]) : null };
}
function summary(season: number, extra: Partial<SummaryFile> = {}): SummaryFile {
  return { league: 'fba', season, locked: true, host: null, champions: [], ...extra } as SummaryFile;
}
const series = (id: string, winner: string) => ({ id, group: null, round: 3, home: winner, away: null, homeSeed: 1, awaySeed: null, homeWins: 4, awayWins: 0, winner, next: null });
const s79 = summary(79, {
  awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'BOS' }, { award: 'ROTY', playerId: 'p00002', teamId: 'NY' }],
  allFba: {
    team1: [{ slot: 'G', playerId: 'p00001', teamId: 'BOS' }, { slot: 'F', playerId: null, teamId: null }],
    team2: [{ slot: 'G', playerId: 'p00002', teamId: 'NY' }],
  },
  allStar: { allStars: ['p00001', 'p00003'], youngStars: ['p00002'], asgMvp: 'p00001', fivePoint: null, dunk: 'p00002' },
  champions: [{ title: 'FBA Champion', champion: 'Boston', runnerUp: 'New York', score: null, teamId: 'BOS', runnerUpId: 'NY', finalsMvp: 'p00001' }],
  bracket: { seeds: [], series: [series('E-CF', 'BOS'), series('W-CF', 'LA'), series('FINALS', 'BOS')] } as unknown as SummaryFile['bracket'],
  players: [line('p00001', 'BOS', 1, 80, 2000), line('p00002', 'NY', 1, 70, 700), line('p00003', 'LA', 1, 60, 900)],
} as Partial<SummaryFile>);

describe('summaryAwardCounts', () => {
  it('counts each honour once, and champions, finalists and conference winners from the lines', () => {
    const counts = summaryAwardCounts([s79], 79, 79);
    expect(counts.get('p00001')).toEqual({
      MVP: 1, ALL_FBA_1: 1, ALL_STAR: 1, ASG_MVP: 1, FINALS_MVP: 1, CHAMPION: 1, CSHIP_APP: 1, CONF_CHAMPION: 1,
    });
    expect(counts.get('p00002')).toEqual({ ROTY: 1, ALL_FBA_2: 1, YOUNG_STAR: 1, DUNK: 1, CSHIP_APP: 1 });
    expect(counts.get('p00003')).toEqual({ ALL_STAR: 1, CONF_CHAMPION: 1 });
  });

  it('respects the season range and skips other leagues', () => {
    expect(summaryAwardCounts([s79], 80, 9999).size).toBe(0);
    expect(summaryAwardCounts([{ ...s79, league: 'fbad2' } as SummaryFile], 1, 9999).size).toBe(0);
  });

  it('counts no champions without player lines', () => {
    const counts = summaryAwardCounts([{ ...s79, players: undefined }], 79, 79);
    expect(counts.get('p00001')).toEqual({ MVP: 1, ALL_FBA_1: 1, ALL_STAR: 1, ASG_MVP: 1, FINALS_MVP: 1 });
  });
});

const shannon = { born: 'Born-S50', entries: ['New Mexico State-S66', 'Creighton-S67', 'CP-S68-pres.', '2x Young-Star', '10x All-Star', '2x MVP'] };

describe('liveCareer', () => {
  it('extends a present stint on the same team', () => {
    const c = liveCareer(shannon, 'p00009', [summary(79, { players: [line('p00009', 'CP', 1, 70, 1400)] })], null);
    const cp = c.stints.filter(s => s.kind === 'fba');
    expect(cp).toHaveLength(1);
    expect(cp[0]).toMatchObject({ team: 'CP', from: 68, to: 79, range: 'S68-S79' });
  });

  it('closes the old stint at S78 on a team change and opens a new one', () => {
    const c = liveCareer(shannon, 'p00009', [summary(79, { players: [line('p00009', 'BOS', 1, 70, 1400)] })], null);
    const fba = c.stints.filter(s => s.kind === 'fba');
    expect(fba.map(s => [s.team, s.range, s.to])).toEqual([['CP', 'S68-S78', 78], ['BOS', 'S79', 79]]);
  });

  it('gives a player without a bio only app stints', () => {
    const c = liveCareer(null, 'p00009', [summary(79, { players: [line('p00009', 'CP', 1, 70, 1400)] }), summary(80, { players: [line('p00009', 'CP', 1, 70, 1400)] })], null);
    expect(c.stints).toHaveLength(1);
    expect(c.stints[0]).toMatchObject({ kind: 'fba', team: 'CP', from: 79, to: 80, range: 'S79-S80' });
    expect(liveCareer(null, 'p00009', [], null)).toEqual({ stints: [], nationalTeams: [], hof: null, other: [] });
  });

  it('adds S79 honours to the stint that held the team', () => {
    const summaries = [summary(79, {
      allStar: { allStars: ['p00009'], youngStars: [], asgMvp: null, fivePoint: null, dunk: null },
      awards: [{ award: 'MIP', playerId: 'p00009', teamId: 'CP' }],
      players: [line('p00009', 'CP', 1, 70, 1400)],
    })];
    const c = liveCareer(shannon, 'p00009', summaries, null);
    const cp = c.stints[2];
    expect(cp.honours.find(h => h.label === 'All-Star')).toEqual({ label: 'All-Star', count: 11, seasons: [] });
    expect(cp.honours.find(h => h.label === 'MIP')).toEqual({ label: 'MIP', count: 1, seasons: [79] });
    expect(careerLines(c)).toContain('11x All-Star');
    expect(careerLines(c)).toContain('S79 MIP');
  });

  it('adds champion, finalist and conference labels by conference', () => {
    const c = liveCareer(null, 'p00001', [s79], null);
    expect(c.stints[0].honours.map(h => h.label)).toEqual([
      'MVP', 'All-FBA T1', 'All-Star', 'ASG MVP', 'FBA C-Ship MVP', 'FBA Champion', 'FBA C-Ship app.', 'EC Champion',
    ]);
    expect(liveCareer(null, 'p00003', [s79], null).stints[0].honours.map(h => h.label)).toEqual(['All-Star', 'WC Champion']);
  });

  it('takes the Hall of Fame class from the Hall doc when the bio has none', () => {
    const hof = { league: 'fba', classes: [{ season: 'S80', inductees: [{ name: 'X', playerId: 'p00009', retiredSeason: 'S79', lines: [] }] }], nominees: [], removed: [] } as HallOfFameFile;
    expect(liveCareer(null, 'p00009', [], hof).hof).toBe('S80');
    expect(liveCareer({ born: 'Born-S1', entries: ['CIN-S1-S2', 'HOF-S77'] }, 'p00009', [], hof).hof).toBe('S77');
    expect(liveCareer(null, 'p00010', [], hof).hof).toBeNull();
  });
});

describe('careerLines', () => {
  it('matches the stored Atkinson card', () => {
    const c = parseBio({
      born: 'Born-S46',
      entries: ['Alabama-S64', '1x NC app.', '1x All-American', '1x DH Award', '1x SEC RS Champion', '1x SEC TOUR Champion',
        'FLO-S65-S76', '12x All-Star', '2x Young-Star', '6x FBA C-Ship app.', '2x FBA Champion', '4x WC Champion', '1x MC Award', '1x All-FBA T1', '5x All-FBA T2',
        'NO-S77-S78', '2x All-Star', 'HOF-S78'],
    });
    expect(careerLines(c)).toEqual(['Alabama: S64', 'FLO: S65-S76', 'NO: S77-S78', '14x All-Star', '2x Young-Star', '6x FBA C-Ship app.',
      '2x FBA Champion', '4x Conference Champion', '1x MC Award', '1x All-FBA T1', '5x All-FBA T2']);
  });

  it('prints an open stint to S78 when there are no app lines', () => {
    expect(careerLines(parseBio(shannon))).toEqual(['New Mexico State: S66', 'Creighton: S67', 'CP: S68-S78', '2x Young-Star', '10x All-Star', '2x MVP']);
  });

  it('merges EC and WC titles, drops D2 and WC stints, and keeps single seasons', () => {
    const c = parseBio({ born: 'Born-S1', entries: ['D2(Milan)-S53-S56', '3x All-Star', 'CIN-S60-S61', '1x EC Champion', 'S61 MIP', 'OAK-S62', '2x WC Champion'] });
    expect(careerLines(c)).toEqual(['CIN: S60-S61', 'OAK: S62', '3x Conference Champion', 'S61 MIP']);
  });
});

describe('awardTotals', () => {
  const baseline: AwardCountsFile = { league: 'fba', throughSeason: 78, counts: [{ playerId: 'p00001', key: 'MVP', count: 2 }, { playerId: 'p00002', key: 'MVP', count: 5 }] };
  const s78 = summary(78, { awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'BOS' }] });
  it('adds the summaries after the baseline season', () => {
    const t = awardTotals('p00001', baseline, [s79, s78]);
    expect(t.MVP).toBe(3);
    expect(t.ALL_STAR).toBe(1);
    expect(t.DUNK).toBe(0);
    expect(Object.keys(t)).toHaveLength(19);
  });
  it('counts every season with a null baseline', () => {
    expect(awardTotals('p00001', null, [s79, s78]).MVP).toBe(2);
  });
  it('gives every player in one map, including baseline-only players', () => {
    const all = awardTotalsAll(baseline, [s79, s78]);
    expect(all.get('p00001')?.MVP).toBe(3);
    expect(all.get('p00002')?.MVP).toBe(5);
    expect(all.get('p00002')?.ROTY).toBe(1);
    expect(all.get('p00003')?.ALL_STAR).toBe(1);
    expect(all.has('p99999')).toBe(false);
    expect(awardTotals('p99999', baseline, [s79]).MVP).toBe(0);
  });
});

describe('careerStats', () => {
  it('lists the S78 PPG row, the S79+ stints and a total since S79', () => {
    const s78 = summary(78, { legacyPpg: [{ playerId: 'p00001', teamId: 'BOS', ppg: 24.5 }, { playerId: 'p00002', teamId: 'NY', ppg: 10 }] });
    const traded = summary(80, {
      players: [line('p00001', 'LA', 2, 30, 300), line('p00001', 'BOS', 1, 50, 1000, [10, 250]), line('p00001', null, null, 80, 1300)],
    });
    const { rows, total } = careerStats('p00001', [traded, s79, s78]);
    expect(rows).toEqual([
      { season: 78, teamId: 'BOS', gp: null, pts: null, ppg: 24.5, po: null },
      { season: 79, teamId: 'BOS', gp: 80, pts: 2000, ppg: 25, po: null },
      { season: 80, teamId: 'BOS', gp: 50, pts: 1000, ppg: 20, po: { gp: 10, pts: 250, ppg: 25 } },
      { season: 80, teamId: 'LA', gp: 30, pts: 300, ppg: 10, po: null },
    ]);
    expect(total).toEqual({ gp: 160, pts: 3300, ppg: 20.6 });
  });
  it('is empty for an unknown player', () => {
    expect(careerStats('p99999', [s79])).toEqual({ rows: [], total: { gp: 0, pts: 0, ppg: 0 } });
  });
  it('gives a null PPG for a line with no games, in the season and the playoffs', () => {
    const idle = summary(81, { players: [line('p00001', 'BOS', 1, 0, 0, [0, 0])] });
    const { rows, total } = careerStats('p00001', [idle]);
    expect(rows).toEqual([{ season: 81, teamId: 'BOS', gp: 0, pts: 0, ppg: null, po: { gp: 0, pts: 0, ppg: null } }]);
    expect(total).toEqual({ gp: 0, pts: 0, ppg: 0 });
  });
});

describe('careerTotalsAll', () => {
  it('adds every S79+ stint line per player and skips total lines and earlier seasons', () => {
    const traded = summary(80, {
      players: [line('p00001', 'LA', 2, 30, 300), line('p00001', 'BOS', 1, 50, 1000), line('p00001', null, null, 80, 1300)],
    });
    const all = careerTotalsAll([traded, s79, summary(78, { players: [line('p00001', 'BOS', 1, 10, 10)] })]);
    expect(all.get('p00001')).toEqual({ gp: 160, pts: 3300 });
    expect(all.get('p99999')).toBeUndefined();
    const single = careerStats('p00001', [traded, s79]).total;
    expect(all.get('p00001')).toEqual({ gp: single.gp, pts: single.pts });
  });
});

describe('careerSpan and playerStatus', () => {
  const bio = (entries: string[]) => parseBio({ born: 'Born-S52', entries });
  it('spans the college years through the last stint, "pres" while it runs', () => {
    expect(careerSpan(bio(['Army-S70', 'Ohio State-S71-S73', 'D2(Austin)-S74', 'TOR-S75-S76', 'CP-S77', 'VEG-S78-pres.']))).toEqual({ from: 70, to: 'pres' });
    expect(careerSpan(bio(['Duke-S60-S62', 'BOS-S63-S70']))).toEqual({ from: 60, to: 70 });
    expect(careerSpan(bio(['Born-S1 noise']))).toBeNull();
  });
  it('is a Hall of Famer first, then retired, then wherever the last stint is', () => {
    const active = bio(['Duke-S60', 'BOS-S61-pres.']);
    expect(playerStatus({ ...active, hof: '77' }, true, 78)).toBe('hof');
    expect(playerStatus(active, true, 78)).toBe('retired');
    expect(playerStatus(active, false, 78)).toBe('fba');
    expect(playerStatus(bio(['Duke-S60-S63', 'BOS-S64-S70']), false, 78)).toBe('retired');
    expect(playerStatus(bio(['Duke-S77-S78']), false, 78)).toBe('college');
    expect(playerStatus(bio(['Army-S70', 'D2(Austin)-S78']), false, 78)).toBe('d2');
    expect(playerStatus(bio(['Army-S70', 'WC(Brazil)-S78']), false, 78)).toBe('college');
    expect(playerStatus(bio(['WC(Brazil)-S78']), false, 78)).toBe('wc');
    expect(playerStatus({ stints: [], nationalTeams: [], hof: null, other: [] }, false, 78)).toBe('unknown');
  });
});

describe('parseBio week suffixes', () => {
  it('drops "(W5-W6)" so the team code is read as an FBA team', () => {
    const c = parseBio({ born: 'Born-S40', entries: ['CT(W5-W6)-S58', '1x All-Star', 'D2(Austin)-S59', 'WC(Brazil)-S60'] });
    expect(c.stints.map(s => [s.kind, s.team, s.range])).toEqual([['fba', 'CT', 'S58'], ['d2', 'D2(Austin)', 'S59']]);
    expect(c.nationalTeams.map(s => s.team)).toEqual(['WC(Brazil)']);
    expect(c.stints[0].honours[0].label).toBe('All-Star');
  });
});

describe('applyPlacement', () => {
  const base = () => parseBio({ born: 'Born-S51', entries: ['Penn-S69', 'Iowa-S70-S71', 'VEG-S72-pres.', '2x Young-Star'] });
  it('ends the open stint the season before and starts the new team when he signed elsewhere', () => {
    const c = applyPlacement(base(), { kind: 'fba', team: 'BOS' }, 79);
    expect(c.stints.map(s => [s.team, s.range, s.to])).toEqual([['Penn', 'S69', 69], ['Iowa', 'S70-S71', 71], ['VEG', 'S72-S78', 78], ['BOS', 'S79-pres.', 'pres']]);
    expect(c.stints[2].honours).toHaveLength(1);
  });
  it('leaves a player who is still with his team open, and does not change the input', () => {
    const input = base();
    const c = applyPlacement(input, { kind: 'fba', team: 'VEG' }, 79);
    expect(c.stints).toHaveLength(3);
    expect(c.stints[2]).toMatchObject({ to: 'pres', range: 'S72-pres.' });
    applyPlacement(input, { kind: 'fba', team: 'BOS' }, 79);
    expect(input.stints[2].range).toBe('S72-pres.');
  });
  it('is unchanged when he is on no roster, and moves between leagues', () => {
    const input = base();
    expect(applyPlacement(input, null, 79)).toBe(input);
    const c = applyPlacement(input, { kind: 'd2', team: 'D2(Austin)' }, 79);
    expect(c.stints.map(s => s.kind)).toEqual(['college', 'college', 'fba', 'd2']);
  });
  it('a stint that ended long ago is not reopened for the same team', () => {
    const c = applyPlacement(parseBio({ born: 'Born-S40', entries: ['BOS-S60-S65'] }), { kind: 'fba', team: 'BOS' }, 79);
    expect(c.stints.map(s => s.range)).toEqual(['S60-S65', 'S79-pres.']);
  });
  it('a player signed and traded in the same season keeps a one-season first stint', () => {
    const c = applyPlacement(parseBio({ born: 'Born-S40', entries: ['VEG-S79-pres.'] }), { kind: 'fba', team: 'BOS' }, 79);
    expect(c.stints.map(s => s.range)).toEqual(['S79', 'S79-pres.']);
  });
});
