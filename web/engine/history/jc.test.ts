import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventsFile, JcSchoolHistoryFile, PastBracket, SummaryFile, Team } from '../shared/types';
import { isJcNationalTitle, isJcNitTitle, jcSchoolCase, jcSeasonLabel, jcTitleCounts, jcTitleRows, JC_EARLY_SEASONS, mmRoundsFromBracket } from './jc';

const team = (teamId: string, name: string): Team => ({ teamId, name, abbr: teamId, group: 'B12', logoFolder: null, badge: { bg: 'x', fg: 'y' } } as Team);
const KU = team('KU', 'Kansas');
const champ = (title: string, champion: string, runnerUp: string | null, extra: Record<string, unknown> = {}) => ({ title, champion, runnerUp, score: null, ...extra });
const season = (n: number, champions: SummaryFile['champions'], jc?: SummaryFile['jc'], more: Partial<SummaryFile> = {}): SummaryFile => ({ league: 'fbajc', season: n, locked: true, host: null, champions, ...(jc ? { jc } : {}), ...more });
const baseJc = { confChampions: [], national: [], conference: [], allAmerican: null, mvp: { mm: null, nit: null }, nit: null };

describe('season labels', () => {
  it('shows when the college league own-numbered seasons happened and leaves S48 on alone', () => {
    expect(jcSeasonLabel(11)).toBe('S11 · FBA S37');
    expect(jcSeasonLabel(1)).toBe('S1 · FFL S46');
    expect(jcSeasonLabel(3)).toBe('S3 · FBA S11');
    expect(jcSeasonLabel(48)).toBe('S48');
    expect(jcSeasonLabel(78)).toBe('S78');
  });
  it('agrees with the events tab the app already holds', () => {
    const ev = JSON.parse(readFileSync(new URL('../../data/leagues/fba/events.json', import.meta.url), 'utf8')) as EventsFile;
    const noted = new Map<number, string>();
    for (const b of ev.before) for (const n of b.notes) { const m = /^FB[AC] JC S(\d+)$/.exec(n); if (m) noted.set(Number(m[1]), b.label); }
    for (const s of ev.seasons) for (const n of s.notes) { const m = /^FB[AC] JC S(\d+)$/.exec(n); if (m) noted.set(Number(m[1]), `S${s.season}`); }
    expect([...noted.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    for (const [jc, at] of noted) {
      const e = JC_EARLY_SEASONS[jc];
      expect(at, `JC S${jc}`).toBe(e.era === 'FFL' ? `FFL S${e.season}` : `S${e.season}`);
    }
  });
});

describe('titles', () => {
  it('recognises the national and NIT titles under both spellings', () => {
    expect(isJcNationalTitle('National Champion')).toBe(true);
    expect(isJcNationalTitle('FBAJC National Champion')).toBe(true);
    expect(isJcNationalTitle('NIT Champion')).toBe(false);
    expect(isJcNitTitle('NIT Champion')).toBe(true);
  });
  const seasons = [
    season(11, [champ('National Champion', 'TCU', 'Duke', { teamId: 'TCU', runnerUpId: 'DUKE' })]),
    season(72, [champ('National Champion', 'Kansas', 'TCU', { teamId: 'KU', runnerUpId: 'TCU' }), champ('NIT Champion', 'Seton Hall', 'Purdue', { teamId: 'SHU', runnerUpId: 'PUR' })]),
    season(79, [champ('FBAJC National Champion', 'Kansas', 'Duke', { teamId: 'KU', runnerUpId: 'DUKE' }), champ('NIT Champion', 'Purdue', 'Seton Hall', { teamId: 'PUR', runnerUpId: 'SHU' })]),
  ];
  it('lists newest first with the national and NIT entries', () => {
    const rows = jcTitleRows(seasons);
    expect(rows.map(r => r.season)).toEqual([79, 72, 11]);
    expect(rows[0].national!.champion).toBe('Kansas');
    expect(rows[2].nit).toBeNull();
  });
  it('counts titles and runner-ups per team, by id', () => {
    const counts = jcTitleCounts(jcTitleRows(seasons));
    const ku = counts.find(c => c.key === 'KU')!;
    expect(ku.national).toEqual([72, 79]);
    expect(counts.find(c => c.key === 'TCU')).toMatchObject({ national: [11], runnerUp: [72] });
    expect(counts.find(c => c.key === 'PUR')).toMatchObject({ nit: [79], nitRunnerUp: [72] });
    expect(counts[0].key).toBe('KU');
  });
});

describe('mmRoundsFromBracket', () => {
  const side = (name: string) => ({ name, record: null, seed: null });
  const mk = (): PastBracket => ({
    rounds: 3,
    series: [
      { id: 'R1-1', round: 1, home: side('A'), away: side('B'), homeWins: 1, awayWins: 0, winner: 'home' },
      { id: 'R1-2', round: 1, home: side('C'), away: side('D'), homeWins: 1, awayWins: 0, winner: 'home' },
      { id: 'R2-1', round: 2, home: side('A'), away: side('C'), homeWins: 1, awayWins: 0, winner: 'home' },
    ],
  });
  it('only reads a six-round (64-team) bracket', () => {
    expect(mmRoundsFromBracket(mk()).size).toBe(0);
  });
  it('maps the furthest round each team played', () => {
    const side6 = (name: string) => ({ name, record: null, seed: null });
    const series: PastBracket['series'] = [];
    const add = (round: number, k: number, a: string, b: string, w: 'home' | 'away') => series.push({ id: `R${round}-${k}`, round, home: side6(a), away: side6(b), homeWins: w === 'home' ? 1 : 0, awayWins: w === 'home' ? 0 : 1, winner: w });
    // One path of teams through the bracket; the other slots are filled with placeholders.
    for (let k = 1; k <= 32; k++) add(1, k, `T${2 * k - 1}`, `T${2 * k}`, 'home');
    for (let k = 1; k <= 16; k++) add(2, k, `T${4 * k - 3}`, `T${4 * k - 1}`, 'home');
    for (let k = 1; k <= 8; k++) add(3, k, `T${8 * k - 7}`, `T${8 * k - 3}`, 'home');
    for (let k = 1; k <= 4; k++) add(4, k, `T${16 * k - 15}`, `T${16 * k - 7}`, 'home');
    for (let k = 1; k <= 2; k++) add(5, k, `T${32 * k - 31}`, `T${32 * k - 15}`, 'home');
    add(6, 1, 'T1', 'T33', 'home');
    const out = mmRoundsFromBracket({ rounds: 6, series });
    expect(out.get('T1')).toBe('champion');
    expect(out.get('T33')).toBe('titleGame');
    expect(out.get('T17')).toBe('final4');
    expect(out.get('T9')).toBe('elite8');
    expect(out.get('T5')).toBe('sweet16');
    expect(out.get('T3')).toBe('app');
    expect(out.get('T2')).toBe('app');
  });
});

describe('jcSchoolCase', () => {
  const school: JcSchoolHistoryFile['schools'][number] = {
    teamId: 'KU',
    mm: { app: [11, 12, 48, 72], sweet16: [11, 48, 72], elite8: [48, 72], final4: [48], titleGame: [48], champion: [48] },
    rsChampion: [{ season: 53, conf: null }, { season: 54, conf: null }],
    confTournament: [{ season: 60, conf: null }],
    mmWins: null,
  };
  const seasons = [
    season(48, [champ('National Champion', 'Kansas', 'Wichita State', { teamId: 'KU', runnerUpId: 'WSU' })]),
    season(60, [], { ...baseJc, preseason: [{ event: 'Maui Jim Invitational', champion: 'Kansas', teamId: 'KU' }, { event: 'Champions Classic', champion: 'Duke', teamId: 'DUKE' }] }),
    season(64, [champ('National Champion', 'Alabama', 'Kansas', { teamId: 'ALA', runnerUpId: 'KU' })], {
      ...baseJc,
      national: [{ award: 'POY', playerId: 'p00001', teamId: 'KU', name: 'Charles Petty', school: 'Kansas' }],
      conference: [{ conf: 'B12', playerId: null, teamId: 'KU', name: 'Someone', school: 'Kansas' }, { conf: 'ACC', playerId: null, teamId: 'DUKE' }],
      allAmerican: [{ team: 1, slots: [{ slot: 'G', playerId: null, teamId: 'KU', name: 'A' }, { slot: 'F', playerId: null, teamId: 'DUKE' }, { slot: 'C', playerId: null, teamId: 'DUKE' }, { slot: 'ANY', playerId: null, teamId: 'DUKE' }, { slot: 'ANY', playerId: null, teamId: 'DUKE' }] }],
      confChampions: [{ conf: 'B12', tournament: 'KU', regularSeason: ['KU', 'KSU'] }],
    }),
    season(53, [], { ...baseJc, allAmericanLegacy: { teams: [{ team: 1, slots: [{ slot: 'OUT', name: 'B', school: 'Kansas', playerId: null, teamId: 'KU' }] }] } }),
    season(79, [], { ...baseJc, confChampions: [{ conf: 'B12', tournament: 'KU', regularSeason: ['KU'] }] }),
  ];
  const c = jcSchoolCase(KU, seasons, school);
  it('gathers titles and runner-up seasons from the summaries', () => {
    expect(c.national).toEqual([48]);
    expect(c.runnerUp).toEqual([64]);
  });
  it('takes conference titles from the school doc through S78 and from the summaries after', () => {
    expect(c.rsTitles).toEqual([{ season: 53, conf: null }, { season: 54, conf: null }, { season: 79, conf: null }]);
    expect(c.tournamentTitles).toEqual([{ season: 60, conf: null }, { season: 79, conf: null }]);
  });
  it('finds preseason tournament titles', () => {
    expect(c.preseason).toEqual([{ season: 60, event: 'Maui Jim Invitational' }]);
  });
  it('lists March Madness rounds by season (deepest round reached)', () => {
    expect(c.mm).toEqual([
      { season: 11, round: 'sweet16' }, { season: 12, round: 'app' }, { season: 48, round: 'champion' }, { season: 72, round: 'elite8' },
    ]);
  });
  it('lists the school\'s award winners and All-Americans', () => {
    expect(c.awards.national).toEqual([{ season: 64, award: 'POY', playerId: 'p00001', name: 'Charles Petty' }]);
    expect(c.awards.conference.map(a => a.season)).toEqual([64]);
    expect(c.awards.allAmerican.map(a => [a.season, a.team, a.slot])).toEqual([[53, 1, 'OUT'], [64, 1, 'G']]);
  });
  it('works without a school doc', () => {
    const none = jcSchoolCase(KU, seasons, null);
    expect(none.mm).toEqual([]);
    expect(none.rsTitles).toEqual([{ season: 64, conf: null }, { season: 79, conf: null }]);
    expect(none.national).toEqual([48]);
  });
});
