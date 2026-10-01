import { describe, expect, it } from 'vitest';
import { JcSchoolHistoryFile, JcSummary, PastBracket, SummaryFile } from './types';
import { schemaForPath } from './schemaRegistry';

const side = (name: string, seed: number) => ({ name, record: '20-5', seed });
const oneGame = (score?: string) => ({
  rounds: 1,
  series: [{ id: 'R1-1', round: 1, home: side('Duke', 1), away: side('Kansas', 2), homeWins: 1, awayWins: 0, winner: 'home', ...(score ? { score } : {}) }],
});

const baseJc = {
  confChampions: [{ conf: 'B12', tournament: 'Kansas', regularSeason: ['Kansas', 'Kansas State'] }],
  national: [],
  conference: [],
  allAmerican: null,
  mvp: { mm: null, nit: null },
  nit: null,
};

describe('PastSeries score', () => {
  it('accepts plain and overtime single-game scores', () => {
    for (const score of ['97–75', '48-46 OT', '91-88 2OT']) expect(PastBracket.safeParse(oneGame(score)).success, score).toBe(true);
  });
  it('rejects a malformed suffix', () => {
    expect(PastBracket.safeParse(oneGame('48-46 xx')).success).toBe(false);
  });
  it('still needs the winner to score more with an overtime suffix', () => {
    expect(PastBracket.safeParse(oneGame('46-48 OT')).success).toBe(false);
  });
});

describe('JcSummary imported-history fields', () => {
  it('keeps the 6b shape valid', () => {
    expect(JcSummary.safeParse(baseJc).success).toBe(true);
  });
  it('allows player names and schools beside the ids', () => {
    const jc = {
      ...baseJc,
      national: [{ award: 'POY', playerId: null, teamId: null, name: 'Trae York', school: 'TCU' }],
      conference: [{ conf: 'B12', playerId: 'p00001', teamId: 'KAN', name: 'Chandler Arias', school: 'Texas Tech' }],
      mvpNames: { mm: 'Charles Latley', nit: null },
    };
    expect(JcSummary.safeParse(jc).success).toBe(true);
  });
  it('allows regular-season records parallel to the champions, and rejects a length mismatch', () => {
    const ok = { ...baseJc, confChampions: [{ ...baseJc.confChampions[0], regularSeasonRecords: ['12-3', null] }] };
    expect(JcSummary.safeParse(ok).success).toBe(true);
    const bad = { ...baseJc, confChampions: [{ ...baseJc.confChampions[0], regularSeasonRecords: ['12-3'] }] };
    expect(JcSummary.safeParse(bad).success).toBe(false);
  });
  it('allows preseason champions and a NIT bracket', () => {
    const jc = { ...baseJc, preseason: [{ event: 'Maui Jim Invitational', champion: 'Alabama' }], nitBracket: oneGame('70-60') };
    expect(JcSummary.safeParse(jc).success).toBe(true);
  });
  it('allows a legacy All-American block in the sheet slot labels', () => {
    const legacy = { teams: [{ team: 1, slots: [{ slot: 'OUT', name: 'Jaime Snow', school: 'Florida State', playerId: null }, { slot: 'MID', name: 'Leonard Harris', school: 'Stanford', playerId: 'p00002' }] }] };
    expect(JcSummary.safeParse({ ...baseJc, allAmericanLegacy: legacy }).success).toBe(true);
  });
  it('rejects a legacy block with an empty team', () => {
    expect(JcSummary.safeParse({ ...baseJc, allAmericanLegacy: { teams: [{ team: 1, slots: [] }] } }).success).toBe(false);
  });
  it('rejects both All-American shapes on one season', () => {
    const slots = (['G', 'F', 'C', 'ANY', 'ANY'] as const).map(slot => ({ slot, playerId: null, teamId: null }));
    const both = { ...baseJc, allAmerican: [{ team: 1, slots }], allAmericanLegacy: { teams: [{ team: 1, slots: [{ slot: 'OUT', name: 'A B', school: null, playerId: null }] }] } };
    expect(JcSummary.safeParse(both).success).toBe(false);
  });
  it('still rejects unknown keys', () => {
    expect(JcSummary.safeParse({ ...baseJc, extra: 1 }).success).toBe(false);
  });
});

describe('SummaryFile with an imported college season', () => {
  it('accepts champions with a score and the extended jc block', () => {
    const doc = {
      league: 'fbajc', season: 12, locked: true, host: null,
      champions: [{ title: 'National Champion', champion: 'Duke', runnerUp: 'TCU', score: '28-27', finalsMvp: null }],
      jc: { ...baseJc, mvpNames: { mm: 'Demarcus Allen', nit: null } },
    };
    expect(SummaryFile.safeParse(doc).success).toBe(true);
  });
});

describe('JcSchoolHistoryFile', () => {
  const school = (over = {}) => ({
    teamId: 'BAY',
    mm: { app: [11, 12, 63], sweet16: [11, 63], elite8: [63], final4: [63], titleGame: [63], champion: [63] },
    rsChampion: [{ season: 60, conf: null }, { season: 62, conf: 'A10' }],
    confTournament: [{ season: 62, conf: null }],
    mmWins: 20,
    ...over,
  });
  const file = (schools: unknown[]) => ({ league: 'fbajc', throughSeason: 78, schools });

  it('accepts a valid file', () => {
    expect(JcSchoolHistoryFile.safeParse(file([school()])).success).toBe(true);
  });
  it('rejects a school listed twice', () => {
    expect(JcSchoolHistoryFile.safeParse(file([school(), school()])).success).toBe(false);
  });
  it('rejects unsorted or repeated seasons', () => {
    const bad = school({ mm: { ...school().mm, app: [12, 11, 63] } });
    expect(JcSchoolHistoryFile.safeParse(file([bad])).success).toBe(false);
    const dup = school({ mm: { ...school().mm, app: [11, 11, 63] } });
    expect(JcSchoolHistoryFile.safeParse(file([dup])).success).toBe(false);
  });
  it('rejects a deeper round missing from a shallower list', () => {
    const bad = school({ mm: { ...school().mm, elite8: [] } });
    expect(JcSchoolHistoryFile.safeParse(file([bad])).success).toBe(false);
  });
  it('allows an unknown mmWins and no titles', () => {
    const none = school({ mm: { app: [], sweet16: [], elite8: [], final4: [], titleGame: [], champion: [] }, rsChampion: [], confTournament: [], mmWins: null });
    expect(JcSchoolHistoryFile.safeParse(file([none])).success).toBe(true);
  });
  it('is picked up by the schema registry', () => {
    expect(schemaForPath('leagues/fbajc/schoolHistory.json')).toBe(JcSchoolHistoryFile);
    expect(schemaForPath('leagues/fba/schoolHistory.json')).toBeNull();
  });
});
