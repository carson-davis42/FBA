import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import type { SeasonState } from '../season/state';
import { fbaSeasonState } from '../season/testFixtures';
import { ASG_PICKS, asgAvailable, asgPick, asgTeams, startAsgDraft } from './asgDraft';
import { asgLineups, runAsg } from './asgGame';
import { type AllStarResult, fbaPlayers } from './common';
import { contestTurn, drawCounts, drawFilled, drawOnClock, startContestDraw } from './contestDraw';
import { playExhibition, pointsFor, toSimGame, topScorer, type Roster } from './exhibition';
import { winProbability } from '../season/sim';
import { cutField, runContest, runDunk, runFivePoint } from './contests';
import { saveSelections, suggestSelections } from './selection';
import { allStarStep, finishAllStar } from './steps';
import { allStarRosters } from './testFixtures';
import { runYoungStar, startYsgDraft, ysgAvailable, ysgOnClock, ysgPick, ysgTeamOf, ysgTeams } from './youngStars';

const seq = (...xs: number[]): Rng => { let k = 0; return () => xs[k++ % xs.length]; };
const ok = (r: AllStarResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.doc;
};
const fx = allStarRosters();
const list = fbaPlayers(fx.rosters, fx.players);

function throughStep(step: 'contests' | 'ysgDraft' | 'asg') {
  const sel = suggestSelections(list, new Map());
  const youngCaptains = list.filter(p => !sel.youngStars.includes(p.playerId)).slice(0, 4).map(p => p.playerId);
  let doc = ok(saveSelections(null, { ...sel, youngCaptains }, 79, list, fx.players));
  doc = ok(startAsgDraft(doc, mulberry32(1)));
  for (let k = 0; k < ASG_PICKS; k++) doc = ok(asgPick(doc, asgAvailable(doc, list)[0].playerId, list));
  doc = ok(startContestDraw(doc, fx.teamIds, mulberry32(2)));
  while (!drawFilled(doc)) {
    const team = drawOnClock(doc)!;
    const contest = drawCounts(doc)['5pt'] < 10 ? '5pt' : 'dunk';
    doc = ok(contestTurn(doc, { contest, playerId: list.find(p => p.teamId === team)!.playerId }, list));
  }
  if (step === 'contests') return doc;
  doc = ok(runFivePoint(doc, mulberry32(3)));
  doc = ok(runDunk(doc, mulberry32(4)));
  doc = ok(startYsgDraft(doc, mulberry32(5)));
  if (step === 'ysgDraft') return doc;
  for (let k = 0; k < 20; k++) doc = ok(ysgPick(doc, ysgAvailable(doc, list)[0].playerId, list));
  return doc;
}

describe('contests', () => {
  it('settles a tie at the cutoff with a roll-off', () => {
    const r = cutField(['a', 'b', 'c', 'd'], { a: 30, b: 20, c: 20, d: 10 }, 2, seq(0, 0, 0.99, 0.99));
    expect(r.advanced).toEqual(['a', 'c']);
    expect(r.rollOffs).toEqual([{ ids: ['b', 'c'], rounds: [{ b: [1, 1], c: [6, 6] }] }]);
    expect(cutField(['a', 'b', 'c'], { a: 3, b: 2, c: 1 }, 2, seq(0)).rollOffs).toEqual([]);
  });

  it('runs 10 → 5 → 3 → 1 with 3 rolls per round and running totals', () => {
    const players = Array.from({ length: 10 }, (_, k) => `p${String(20000 + k)}`);
    const res = runContest(players, [5, 3, 1], mulberry32(7));
    expect(res.rounds.map(r => r.players.length)).toEqual([10, 5, 3]);
    expect(res.rounds.map(r => r.advanced.length)).toEqual([5, 3, 1]);
    expect(res.winner).toBe(res.rounds[2].advanced[0]);
    for (const r of res.rounds) for (const id of r.players) expect(r.rolls[id]).toHaveLength(3);
    const w = res.winner;
    expect(res.rounds[2].totals[w]).toBeGreaterThan(res.rounds[1].totals[w]);
  });

  it('runs both contests from the draw', () => {
    const doc = throughStep('contests');
    const after = ok(runDunk(ok(runFivePoint(doc, mulberry32(1))), mulberry32(2)));
    expect(after.fivePoint!.rounds[0].players).toHaveLength(10);
    expect(after.dunk!.rounds.map(r => r.players.length)).toEqual([4, 3, 2]);
    expect(runFivePoint(after, mulberry32(1)).ok).toBe(false);
  });
});

describe('Young-Star tournament', () => {
  it('draws two semifinals at random and plays the winners in the final, on the game engine', () => {
    const doc = throughStep('asg');
    expect(ysgTeams(doc).map(t => t.length)).toEqual([5, 5, 5, 5]);
    const played = ok(runYoungStar(doc, list, mulberry32(9)));
    const { semis, final, champion } = played.ysg!;
    expect(semis).toHaveLength(2);
    expect(new Set(semis.flatMap(g => g.teams)).size).toBe(4);
    expect([final.teams[0], final.teams[1]]).toEqual(semis.map(g => g.winner));
    expect(champion).toBe(final.winner);
    for (const g of [...semis, final]) {
      // Four quarters of 30 possessions, 5 players a side who stay on the floor all game, and no ties.
      expect(g.lineups.length).toBeGreaterThanOrEqual(4);
      for (const [home, away] of g.lineups) { expect(home).toHaveLength(5); expect(away).toHaveLength(5); }
      expect(g.rosters.map(r => r.length)).toEqual([5, 5]);
      expect(g.lineups.every(l => l[0].join() === g.lineups[0][0].join() && l[1].join() === g.lineups[0][1].join())).toBe(true);
      expect(g.scores[0]).not.toBe(g.scores[1]);
      const sum = (side: number) => g.points.reduce((n, period) => n + g.lineups[0][side].reduce((m, id) => m + (period[id] ?? 0), 0), 0);
      expect([sum(0), sum(1)]).toEqual(g.scores);
      expect(g.scores[g.teams.indexOf(g.winner)]).toBeGreaterThan(g.scores[1 - g.teams.indexOf(g.winner)]);
    }
  });

  it('plays different brackets for different seeds', () => {
    const doc = throughStep('asg');
    const firstSemis = new Set(Array.from({ length: 12 }, (_, i) => ok(runYoungStar(doc, list, mulberry32(i))).ysg!.semis[0].teams.join('v')));
    expect(firstSemis.size).toBeGreaterThan(2);
  });

  it('names the champion team\'s top scorer across its games as the MVP', () => {
    const doc = throughStep('asg');
    for (let seed = 0; seed < 8; seed++) {
      const { ysg } = ok(runYoungStar(doc, list, mulberry32(seed)));
      const roster = ysgTeams(doc)[ysg!.champion];
      expect(roster).toContain(ysg!.mvp);
      const pts = pointsFor([...ysg!.semis, ysg!.final], roster);
      expect(pts.get(ysg!.mvp)).toBe(Math.max(...pts.values()));
    }
  });
});

describe('Young-Star draft', () => {
  it('lets a team take another of a position it already has, and offers every Young-Star left', () => {
    let doc = throughStep('ysgDraft');
    const first = ysgAvailable(doc, list);
    expect(first).toHaveLength(20);
    const team = ysgOnClock(doc)!;
    doc = ok(ysgPick(doc, first[0].playerId, list));
    // Come back round to the same team: the best player left at the same position is still on offer and can be picked.
    while (ysgOnClock(doc) !== team) doc = ok(ysgPick(doc, ysgAvailable(doc, list)[0].playerId, list));
    const samePos = ysgAvailable(doc, list).find(p => p.position === first[0].position);
    expect(samePos).toBeTruthy();
    doc = ok(ysgPick(doc, samePos!.playerId, list));
    const mine = ysgTeams(doc)[team].map(id => list.find(p => p.playerId === id)!.position);
    expect(mine.filter(p => p === first[0].position)).toHaveLength(2);
  });
});

describe('exhibition games', () => {
  const side = (prefix: string, rating: number, n = 5): Roster => Array.from({ length: n }, (_, i) => ({ playerId: `${prefix}${i}`, position: (['PG', 'SG', 'SF', 'PF', 'C'] as const)[i % 5], rating }));
  const five = [[0, 1, 2, 3, 4]];

  it('credits every point to a player on the floor and plays overtime until someone wins', () => {
    const games = Array.from({ length: 30 }, (_, i) => playExhibition([2, 3], [side('a', 70), side('b', 70)], [five, five], mulberry32(i)));
    for (const g of games) {
      expect(g.scores[0]).not.toBe(g.scores[1]);
      expect(g.lineups.length).toBe(4 + g.ot);
      const total = g.points.reduce((n, p) => n + Object.values(p).reduce((a, b) => a + b, 0), 0);
      expect(total).toBe(g.scores[0] + g.scores[1]);
      expect(g.plays.reduce((n, p) => n + p[3], 0)).toBe(total);
      expect(g.winner).toBe(g.scores[0] > g.scores[1] ? 2 : 3);
    }
    expect(games.some(g => g.ot > 0)).toBe(true);
  });

  it('changes lineups by quarter and goes back to the first lineup in overtime', () => {
    const home = side('a', 70, 20);
    const rotation = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19]];
    const games = Array.from({ length: 60 }, (_, i) => playExhibition([0, 1], [home, side('z', 70)], [rotation, five], mulberry32(i)));
    for (const g of games) {
      expect(g.lineups.slice(0, 4).map(l => l[0][0])).toEqual(['a0', 'a5', 'a10', 'a15']);
      for (const l of g.lineups.slice(4)) expect(l[0][0]).toBe('a0');
      // Only the five on the floor in a period score in it.
      g.points.forEach((p, q) => { for (const id of Object.keys(p)) { if (id.startsWith('a')) expect(g.lineups[q][0]).toContain(id); } });
    }
    expect(games.some(g => g.ot > 0)).toBe(true);
  });

  it('replays into a game the live viewer can step through, with the same score, periods and box', () => {
    const home = side('a', 70, 10);
    const rotation = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [0, 1, 2, 3, 4], [5, 6, 7, 8, 9]];
    const g = playExhibition([0, 1], [home, side('z', 70)], [rotation, five], mulberry32(5));
    const sim = toSimGame(g, ['Team A', 'Team Z']);
    expect([sim.homePts, sim.awayPts]).toEqual(g.scores);
    expect(sim.possessions).toHaveLength(g.plays.length);
    expect(sim.possessions[sim.possessions.length - 1]).toMatchObject({ homeScore: g.scores[0], awayScore: g.scores[1] });
    expect(sim.periods.home.reduce((a, b) => a + b, 0)).toBe(g.scores[0]);
    expect(sim.box.home.reduce((a, b) => a + b, 0)).toBe(g.scores[0]);
    expect(sim.home.players.map(p => p.playerId)).toEqual(home.map(p => p.playerId));
    const p = winProbability(sim, 40, mulberry32(1), 20);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
    expect(winProbability(sim, sim.possessions.length, mulberry32(1))).toBe(g.scores[0] > g.scores[1] ? 1 : 0);
  });

  it('gives the MVP to the top scorer on the given roster, settling a tie at random', () => {
    const game = (points: Record<string, number>[]) => ({
      teams: [0, 1] as [number, number], rosters: [[], []] as [never[], never[]], plays: [], lineups: [[['A', 'B', 'C'], ['X']]] as [string[], string[]][], points, scores: [0, 0] as [number, number], ot: 0, winner: 0,
    });
    expect(topScorer([game([{ A: 4, B: 9, X: 30 }, { A: 6, C: 2 }])], ['A', 'B', 'C'], mulberry32(1))).toBe('A');
    const tied = new Set(Array.from({ length: 40 }, (_, i) => topScorer([game([{ A: 5, B: 5, C: 1 }])], ['A', 'B', 'C'], mulberry32(i))));
    expect([...tied].sort()).toEqual(['A', 'B']);
  });
});

describe('All-Star Game', () => {
  const m = (id: string, position: 'PG' | 'SG' | 'SF' | 'PF' | 'C') => ({ playerId: id, position });
  it('rotates each position by draft order, and slots extras into the nearest repeat', () => {
    const members = [
      m('p1', 'PG'), m('s1', 'SG'), m('f1', 'SF'), m('q1', 'PF'), m('c1', 'C'),
      m('s2', 'SG'), m('f2', 'SF'), m('f3', 'SF'), m('q2', 'PF'), m('q3', 'PF'), m('q4', 'PF'),
      m('c2', 'C'), m('c3', 'C'), m('c4', 'C'), m('c5', 'C'), m('c6', 'C'),
    ];
    const q = asgLineups(members).map(quarter => quarter.map(s => `${s.slot}:${s.playerId}`));
    expect(q[0]).toEqual(['PG:p1', 'SG:s1', 'SF:f1', 'PF:q1', 'C:c1']);
    expect(q[1]).toEqual(['PG:c6', 'SG:s2', 'SF:f2', 'PF:q2', 'C:c2']);
    expect(q[2]).toEqual(['PG:p1', 'SG:c5', 'SF:f3', 'PF:q3', 'C:c3']);
    expect(q[3]).toEqual(['PG:p1', 'SG:s1', 'SF:f1', 'PF:q4', 'C:c4']);
  });

  it('plays four quarters on the game engine with each team rotating its lineups, and names the winners\' top scorer MVP', () => {
    const before = ok(runYoungStar(throughStep('asg'), list, mulberry32(10)));
    const doc = ok(runAsg(before, list, mulberry32(11)));
    const { game, mvp } = doc.asg!;
    const teams = asgTeams(doc);
    expect(game.lineups.length).toBe(4 + game.ot);
    for (const [s, ids] of teams.entries()) {
      const info = ids.map(id => ({ playerId: id, position: list.find(p => p.playerId === id)!.position }));
      const expected = asgLineups(info).map(q => q.map(x => x.playerId));
      expect(game.lineups.slice(0, 4).map(l => l[s])).toEqual(expected);
      for (const l of game.lineups.slice(4)) expect(l[s]).toEqual(expected[0]);
    }
    expect(game.scores[0]).not.toBe(game.scores[1]);
    expect(teams[game.winner]).toContain(mvp);
    const pts = pointsFor([game], teams[game.winner]);
    expect(pts.get(mvp)).toBe(Math.max(...pts.values()));
  });
});

describe('steps and finishing', () => {
  it('walks the steps in order', () => {
    expect(allStarStep(null)).toBe('selections');
    expect(allStarStep(throughStep('contests'))).toBe('fivePoint');
    expect(allStarStep(throughStep('ysgDraft'))).toBe('ysgDraft');
  });

  it('finishes only at wrap-up during the All-Star pause', () => {
    const s = fbaSeasonState();
    const games = Array.from({ length: 12 }, (_, k) => ({ gameNo: k + 1, home: 'BOS', away: 'CAR', homePts: 50, awayPts: 40 }));
    const paused: SeasonState = {
      ...s,
      results: { ...s.results!, games },
      schedule: { ...s.schedule!, pauses: s.schedule!.pauses.map((p, i) => (i < 4 ? { ...p, done: true } : p)) },
    };
    expect(finishAllStar(paused)).toEqual({ ok: false, problems: ['Finish every All-Star event first'] });
    let doc = throughStep('asg');
    doc = ok(runYoungStar(doc, list, mulberry32(1)));
    doc = ok(runAsg(doc, list, mulberry32(2)));
    expect(allStarStep(doc)).toBe('wrapup');
    const r = finishAllStar({ ...paused, allstar: doc });
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.label).toBe('Finish All-Star weekend');
    expect(r.changed).toEqual(['allstar', 'schedule']);
    expect(r.state.allstar!.locked).toBe(true);
    expect(r.state.schedule!.pauses[4].done).toBe(true);
    expect(allStarStep(r.state.allstar)).toBe('done');
  });
});
