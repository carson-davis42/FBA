import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { recordGames, simNextGames, toGameResult } from '../season/moves';
import type { Possession, SimGame, SimTeam } from '../season/sim';
import { fbaSeasonState } from '../season/testFixtures';
import type { ResultsFile, RostersFile } from '../shared/types';
import { defenseLines, expHundredths, leagueRefRating, pointsSavedPerGame, seasonDefense } from './defense';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const team = (id: string, ratings: number[]): SimTeam => ({ teamId: id, players: ratings.map((rating, k) => ({ playerId: `${id}${k}`, position: POS[k], rating })) });
const poss = (offense: 'home' | 'away', handler: number, defender: number, points: 0 | 2 | 3): Possession => ({
  i: 0, period: 1, offense, handler, defender, made: points > 0, points, homeScore: 0, awayScore: 0, clutch: false, end: 120,
});
function game(possessions: Possession[]): SimGame {
  return {
    gameNo: 1, home: team('H', [90, 80, 80, 80, 80]), away: team('A', [70, 70, 70, 70, 70]), possessions,
    homePts: 5, awayPts: 0, ot: 0, periods: { home: [5, 0, 0, 0], away: [0, 0, 0, 0] }, box: { home: [5, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] },
  };
}

describe('expHundredths', () => {
  it('is 2 points per make plus 1 more for a three, in hundredths', () => {
    expect(expHundredths(64)).toBe(162);
    expect(expHundredths(44)).toBe(102);
    expect(expHundredths(30)).toBe(60);
  });
});

describe('defenseLines', () => {
  it('credits each possession to its defender, with exp against the reference rating', () => {
    // Ref 80: makeChance(90, 80) = 64 → 162; makeChance(70, 80) = 44 → 102.
    const d = defenseLines(game([poss('home', 0, 0, 2), poss('away', 1, 2, 0), poss('home', 0, 0, 3)]), 80);
    expect(d.away[0]).toEqual({ def: 2, stops: 0, allowed: 5, exp: 324 });
    expect(d.home[2]).toEqual({ def: 1, stops: 1, allowed: 0, exp: 102 });
    expect(d.home[0]).toEqual({ def: 0, stops: 0, allowed: 0, exp: 0 });
  });
});

describe('leagueRefRating', () => {
  it('is the rounded mean over rated rostered players', () => {
    const rosters: RostersFile = { league: 'fba', season: 79, locked: false, teams: {
      A: [{ playerId: 'p1', position: 'PG', rating: 90, age: 25, points: 0 }, { playerId: 'p2', position: 'SG', rating: 81, age: 25, points: 0 }],
      B: [{ playerId: null, position: 'C', rating: null, age: null, points: 0 }, { playerId: 'p3', position: 'C', rating: 80, age: 25, points: 0 }],
    } };
    expect(leagueRefRating(rosters)).toBe(84);
  });
});

describe('seasonDefense and pointsSavedPerGame', () => {
  it('sums only lines that carry defensive stats', () => {
    const results: ResultsFile = { league: 'fba', season: 79, locked: false, games: [
      { gameNo: 1, home: 'A', away: 'B', homePts: 10, awayPts: 8, box: { home: [{ playerId: 'p1', pts: 10, def: 10, stops: 6, allowed: 8, exp: 1200 }], away: [{ playerId: 'p2', pts: 8 }] } },
      { gameNo: 2, home: 'A', away: 'B', homePts: 10, awayPts: 8, box: { home: [{ playerId: 'p1', pts: 10, def: 12, stops: 5, allowed: 14, exp: 1300 }], away: [] } },
    ] };
    const t = seasonDefense(results);
    expect(t.get('p1')).toEqual({ games: 2, def: 22, stops: 11, allowed: 22, exp: 2500 });
    expect(t.has('p2')).toBe(false);
    expect(pointsSavedPerGame(t.get('p1')!)).toBeCloseTo(1.5);
  });
});

describe('saved games carry defensive stats', () => {
  it('toGameResult adds them only with a reference rating, and recordGames passes one', () => {
    const s = fbaSeasonState();
    const { games } = simNextGames({ ...s, schedule: { ...s.schedule!, pauses: [] } }, 1, mulberry32(4));
    expect(toGameResult(games[0]).box!.home[0].def).toBeUndefined();
    const withDef = toGameResult(games[0], 80);
    const lines = [...withDef.box!.home, ...withDef.box!.away];
    expect(lines.reduce((n, l) => n + l.def!, 0)).toBe(games[0].possessions.length);
    const r = recordGames({ ...s, schedule: { ...s.schedule!, pauses: [] } }, games);
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.state.results!.games[0].box!.away[0].def).toBeTypeOf('number');
  });
});
