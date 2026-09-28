import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { recordGames, simNextGames } from '../season/moves';
import type { SeasonState } from '../season/state';
import { fullD2State, fullFbaState } from '../playoffs/testFixtures';
import type { RostersFile } from '../shared/types';
import { isRookie, lastSeasonRatings, mipScore, races, SLOT_POSITIONS, suggestAllFba } from './races';

/** Plays `n` games through the real moves (so box scores carry defensive stats), ignoring pauses. */
function played(state: SeasonState, n: number): SeasonState {
  const s = { ...state, schedule: { ...state.schedule!, pauses: [] } };
  const { games, problem } = simNextGames(s, n, mulberry32(9));
  if (problem) throw new Error(problem);
  const r = recordGames(s, games);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
}

/** Last season: every current player one rating point lower, except team E01, which wasn't in the league. */
function lastSeasonOf(state: SeasonState): RostersFile {
  const teams = Object.fromEntries(Object.entries(state.rosters.teams).filter(([t]) => t !== 'E01')
    .map(([t, es]) => [t, es.map(e => ({ ...e, rating: e.rating === null ? null : e.rating - 1 }))]));
  return { ...state.rosters, season: 78, teams };
}

const fba = played(fullFbaState(), 300);

describe('races (FBA)', () => {
  const last = lastSeasonOf(fba);
  const rs = races(fba, last);
  const race = (id: string) => rs.find(r => r.award === id)!;

  it('returns the seven FBA races in order, with odds on the top 10 only', () => {
    expect(rs.map(r => r.award)).toEqual(['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP']);
    const mvp = race('MVP');
    expect(mvp.rows.length).toBeGreaterThan(10);
    expect(mvp.rows.slice(0, 10).every(r => r.odds !== '')).toBe(true);
    expect(mvp.rows[10].odds).toBe('');
    for (let k = 1; k < mvp.rows.length; k++) expect(mvp.rows[k - 1].score).toBeGreaterThanOrEqual(mvp.rows[k].score);
    const r0 = mvp.rows[0];
    expect(r0.score).toBeCloseTo(r0.parts.ppg + r0.parts.rating + r0.parts.win);
  });

  it('limits races by position and needs 5 games', () => {
    expect(race('PPK').rows.every(r => r.position === 'PG' || r.position === 'SG')).toBe(true);
    expect(race('LP').rows.every(r => r.position === 'SF' || r.position === 'PF')).toBe(true);
    expect(race('MC').rows.every(r => r.position === 'C')).toBe(true);
    expect(race('MVP').rows.every(r => r.games >= 5)).toBe(true);
  });

  it('ranks DPOY by points saved per game from the box scores', () => {
    const d = race('DPOY').rows;
    expect(d.length).toBeGreaterThan(0);
    expect(d[0].defense).not.toBeNull();
    expect(d[0].score).toBeCloseTo(d[0].defense!.saved);
  });

  it('scores MIP from last season and excludes players who were not on last season’s roster', () => {
    const m = race('MIP').rows;
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(r => r.teamId !== 'E01')).toBe(true);
    expect(m[0].mip).toEqual({ lastRating: m[0].rating - 1, boost: 1, secondSeason: false });
    expect(m[0].score).toBeCloseTo(mipScore(1, m[0].rating));
  });

  it('treats restricted players new to the league as rookies', () => {
    const e01 = Object.values(fba.rosters.teams.E01).map(e => ({ ...e, restricted: true }));
    const withRookies = { ...fba, rosters: { ...fba.rosters, teams: { ...fba.rosters.teams, E01: e01 } } };
    const roty = races(withRookies, last).find(r => r.award === 'ROTY')!.rows;
    expect(roty.length).toBeGreaterThan(0);
    expect(roty.every(r => r.teamId === 'E01')).toBe(true);
  });
});

describe('rookie and MIP helpers', () => {
  it('isRookie needs a restricted contract and no spot on last season’s roster', () => {
    const last = new Map<string, number | null>([['p1', 80]]);
    expect(isRookie('p2', true, last)).toBe(true);
    expect(isRookie('p1', true, last)).toBe(false);
    expect(isRookie('p2', false, last)).toBe(false);
  });
  it('mipScore rewards a boost that ends higher', () => {
    expect(mipScore(6, 86)).toBeCloseTo(7.2);
    expect(mipScore(7, 79)).toBeCloseTo(6.8);
  });
  it('lastSeasonRatings handles a missing roster', () => {
    expect(lastSeasonRatings(null).size).toBe(0);
  });
});

describe('suggestAllFba', () => {
  it('fills G, F, C then two ANY from the MVP race, team 1 first, with no repeats', () => {
    const mvp = races(fba, null).find(r => r.award === 'MVP')!;
    const s = suggestAllFba(mvp);
    const all = [...s.team1, ...s.team2];
    expect(all.map(x => x.slot)).toEqual(['G', 'F', 'C', 'ANY', 'ANY', 'G', 'F', 'C', 'ANY', 'ANY']);
    expect(new Set(all.map(x => x.playerId)).size).toBe(10);
    const pos = new Map(mvp.rows.map(r => [r.playerId, r.position]));
    for (const x of all) expect(SLOT_POSITIONS[x.slot].includes(pos.get(x.playerId!)!)).toBe(true);
    const g = mvp.rows.find(r => r.position === 'PG' || r.position === 'SG')!;
    expect(s.team1[0].playerId).toBe(g.playerId);
  });
});

describe('races (D2)', () => {
  it('has one MVP race per league, each limited to that league', () => {
    const d2 = played(fullD2State(), 200);
    const rs = races(d2, null);
    expect(rs.map(r => r.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
    for (const r of rs) expect(r.rows.every(x => x.teamId.startsWith(r.award.slice(4)))).toBe(true);
  });
});
