import { describe, expect, it } from 'vitest';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import type { MetaFile, RostersFile } from '../shared/types';
import { collegeHole, collegeSetupDocs, proPlayerIds, setupCollegeRosters, setupSummary } from './setup';
import { collegeProIds, collegePros, collegeS78Rosters } from './testFixtures';

const META: MetaFile = {
  currentSeason: 79,
  rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
  lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
};

const run = () => {
  const r = setupCollegeRosters({ season: 79, prev: collegeS78Rosters(), proIds: collegeProIds() });
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};

describe('setupCollegeRosters', () => {
  it('moves returning players up a class year with points reset, keeping rating and stars', () => {
    const { rosters } = run();
    expect(rosters).toMatchObject({ league: 'fbajc', season: 79, locked: false });
    expect(rosters.teams.BAY[0]).toEqual({ playerId: 'p00485', position: 'PG', rating: 82, age: null, points: 0, stars: 4, classYear: 'So' });
    expect(rosters.teams.BAY.map(e => e.classYear)).toEqual(['So', null, 'Jr', 'Sr', null]);
    expect(rosters.teams.DUKE.map(e => e.classYear)).toEqual([null, 'So', 'Jr', null, 'So']);
  });

  it('turns Seniors (named or X), players now in the pros and existing holes into holes', () => {
    const { rosters } = run();
    expect(collegeHole('PF')).toEqual({ playerId: null, position: 'PF', rating: null, age: null, points: 0, stars: null, classYear: null });
    expect(rosters.teams.BAY[1]).toEqual(collegeHole('SG'));
    expect(rosters.teams.BAY[4]).toEqual(collegeHole('C'));
    expect(rosters.teams.TEX.map(e => e.playerId)).toEqual([null, null, 'p00502', 'p00503', 'p00504']);
    expect(rosters.teams.DUKE.map(e => e.playerId)).toEqual([null, 'p00511', 'p00512', null, 'p00514']);
  });

  it('keeps five slots per team, one per position, and counts who left', () => {
    const r = run();
    for (const entries of Object.values(r.rosters.teams)) expect(entries.map(e => e.position)).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
    expect(r.counts).toEqual({ seniors: 4, early: 1, holes: 6 });
    expect(setupSummary(r.counts)).toBe('4 Seniors leave, 1 player left early, 6 holes');
    expect(setupSummary({ seniors: 1, early: 9, holes: 1 })).toBe('1 Senior leaves, 9 players left early, 1 hole');
    expect(schemaForPath('leagues/fbajc/S79/rosters.json')!.safeParse(r.rosters).success).toBe(true);
  });

  it('refuses the wrong season and a team without one slot per position', () => {
    expect(setupCollegeRosters({ season: 80, prev: collegeS78Rosters(), proIds: new Set() }))
      .toEqual({ ok: false, problems: ['Set up from the S79 college rosters (got S78)'] });
    const prev = collegeS78Rosters();
    const short: RostersFile = { ...prev, teams: { ...prev.teams, BAY: prev.teams.BAY.slice(0, 4) } };
    expect(setupCollegeRosters({ season: 79, prev: short, proIds: new Set() }))
      .toEqual({ ok: false, problems: ["BAY doesn't have one slot per position"] });
  });
});

describe('proPlayerIds', () => {
  it('collects everyone on the FBA and D2 rosters, the FBA free agents and the D2 Reserves', () => {
    const { fba, d2 } = collegePros();
    const ids = proPlayerIds({
      fba, d2,
      freeAgents: { league: 'fba', season: 79, locked: false, players: [{ playerId: 'p00700', position: 'C', age: 22, rating: null, rookie: true, note: '' }] },
      reserves: { league: 'fbad2', season: 79, locked: false, players: [{ playerId: 'p00701', position: 'SF', age: 25, rating: null }] },
    });
    expect([...ids].sort()).toEqual(['p00500', 'p00510', 'p00700', 'p00701']);
    expect([...proPlayerIds({ fba, d2, freeAgents: null, reserves: null })].sort()).toEqual(['p00500', 'p00510']);
  });
});

describe('collegeSetupDocs', () => {
  it('writes the rosters, a new transactions doc and meta', () => {
    const r = collegeSetupDocs({ meta: META, prev: collegeS78Rosters(), proIds: collegeProIds(), rostersExist: false }, { batchId: 'b1' });
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.label).toBe('Set up S79 college rosters');
    expect(r.counts).toEqual({ seniors: 4, early: 1, holes: 6 });
    expect(r.writes.map(w => w.path)).toEqual(['leagues/fbajc/S79/rosters.json', 'leagues/fbajc/S79/transactions.json', 'meta.json']);
    for (const w of r.writes) {
      expect(schemaForPath(w.path)!.safeParse(w.doc).success).toBe(true);
      expect(pathAgreementProblem(w.path, w.doc)).toBeNull();
    }
    expect(r.writes[1].doc).toEqual({
      league: 'fbajc', season: 79, entries: [{ seq: 1, batchId: 'b1', type: 'season', teams: [], lines: ['S79 college rosters set up from S78'] }],
    });
    expect((r.writes[2].doc as MetaFile).rosterSeason).toEqual({ fba: 79, fbad2: 79, fbajc: 79, fbawc: 78 });
    expect((r.writes[2].doc as MetaFile).currentSeason).toBe(79);
  });

  it('refuses when the rosters exist, or the college rosters are not on the previous season', () => {
    const input = { meta: META, prev: collegeS78Rosters(), proIds: collegeProIds(), rostersExist: true };
    expect(collegeSetupDocs(input, { batchId: 'b1' })).toEqual({ ok: false, problems: ['The S79 college rosters already exist'] });
    const later = { ...META, rosterSeason: { ...META.rosterSeason, fbajc: 79 } };
    expect(collegeSetupDocs({ ...input, rostersExist: false, meta: later }, { batchId: 'b1' }))
      .toEqual({ ok: false, problems: ['The college rosters are on S79, not S78'] });
  });
});
