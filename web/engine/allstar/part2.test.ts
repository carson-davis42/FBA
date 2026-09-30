import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import type { Dice, TeamGame } from '../shared/types';
import type { SeasonState } from '../season/state';
import { fbaSeasonState } from '../season/testFixtures';
import { ASG_PICKS, asgAvailable, asgPick, asgTeams, startAsgDraft } from './asgDraft';
import { asgLineups, runAsg } from './asgGame';
import { type AllStarResult, fbaPlayers } from './common';
import { contestTurn, drawCounts, drawFilled, drawOnClock, startContestDraw } from './contestDraw';
import { cutField, runContest, runDunk, runFivePoint } from './contests';
import { saveSelections, suggestSelections } from './selection';
import { allStarStep, finishAllStar } from './steps';
import { allStarRosters } from './testFixtures';
import { runYoungStar, startYsgDraft, teamGame, ysgAvailable, ysgMvp, ysgPick, ysgTeamOf, ysgTeams } from './youngStars';

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
  it('snakes the draft order', () => {
    const order = [2, 0, 3, 1];
    expect([0, 3, 4, 7, 8].map(k => ysgTeamOf(order, k))).toEqual([2, 1, 1, 2, 2]);
  });

  it('drafts 4 teams of 5 and plays semis and a final', () => {
    const doc = throughStep('asg');
    expect(ysgTeams(doc).map(t => t.length)).toEqual([5, 5, 5, 5]);
    const played = ok(runYoungStar(doc, mulberry32(9)));
    expect(played.ysg!.semis).toHaveLength(2);
    expect([played.ysg!.final.teams[0], played.ysg!.final.teams[1]]).toEqual(played.ysg!.semis.map(g => g.winner));
    expect(played.ysg!.champion).toBe(played.ysg!.final.winner);
    for (const g of [...played.ysg!.semis, played.ysg!.final]) {
      expect(g.rolls).toHaveLength(2);
      expect(g.rolls[0]).toHaveLength(20);
    }
  });

  it('breaks a tied game with a team roll-off', () => {
    const g = teamGame([0, 1], [['p00001'], ['p00002']], 1, 1, seq(0, 0, 0, 0, 0.99, 0.99, 0, 0));
    expect(g.scores).toEqual([2, 2]);
    expect(g.winner).toBe(0);
    expect(g.rollOff!.rounds).toEqual([{ 0: [6, 6], 1: [1, 1] }]);
  });
});

describe('Young-Star MVP', () => {
  const game = (teams: [number, number], rolls: [number, string, Dice][]): TeamGame => ({
    teams, rolls: [rolls.map(([team, playerId, dice]) => ({ team, playerId, dice }))], scores: [0, 0], rollOff: null, winner: teams[0],
  });
  const semi0 = game([2, 3], [[2, 'P1', [3, 4]], [3, 'X1', [6, 6]]]);
  const semi1 = game([0, 1], [[0, 'Z1', [6, 6]]]);

  it('gives the MVP to the top scorer on the champion team', () => {
    const final = game([2, 0], [[2, 'P1', [4, 5]], [2, 'P2', [6, 6]], [0, 'Z1', [6, 6]]]);
    const res = ysgMvp({ semis: [semi0, semi1], final, champion: 2 }, seq(0.5));
    expect(res).toEqual({ mvp: 'P1', mvpRollOff: null });
  });

  it('ignores players on other teams', () => {
    const final = game([2, 0], [[2, 'P2', [1, 1]], [0, 'Z1', [6, 6]], [0, 'Z1', [6, 6]]]);
    const res = ysgMvp({ semis: [semi0, semi1], final, champion: 2 }, seq(0.5));
    expect(res.mvp).toBe('P1');
    expect(res.mvpRollOff).toBeNull();
  });

  it('breaks a tie with a roll-off', () => {
    const final = game([2, 0], [[2, 'P1', [2, 3]], [2, 'P2', [6, 6]]]);
    const s0 = game([2, 3], [[2, 'P1', [5, 4]], [2, 'P2', [1, 1]]]);
    const s1 = game([0, 1], [[0, 'Z1', [6, 6]]]);
    const res = ysgMvp({ semis: [s0, s1], final, champion: 2 }, seq(0, 0, 0.99, 0.99));
    expect(res.mvpRollOff).not.toBeNull();
    expect(res.mvp).toBe('P2');
    expect(res.mvpRollOff!.ids.sort()).toEqual(['P1', 'P2']);
  });

  it('is set by runYoungStar to a champion-team member', () => {
    const doc = throughStep('asg');
    const played = ok(runYoungStar(doc, mulberry32(9)));
    expect(ysgTeams(doc)[played.ysg!.champion]).toContain(played.ysg!.mvp);
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

  it('plays 4 quarters of 10 rolls and names an MVP from the winners', () => {
    const doc = ok(runAsg(ok(runYoungStar(throughStep('asg'), mulberry32(10))), list, mulberry32(11)));
    const { game, mvp } = doc.asg!;
    expect(game.rolls).toHaveLength(4);
    for (const quarter of game.rolls) expect(quarter).toHaveLength(10);
    const winners = asgTeams(doc)[game.winner];
    expect(winners).toContain(mvp);
    if (!game.rollOff) expect(game.scores[game.winner]).toBeGreaterThan(game.scores[1 - game.winner]);
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
    doc = ok(runYoungStar(doc, mulberry32(1)));
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
