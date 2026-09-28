import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile } from '../shared/types';
import { ASG_PICKS, asgAvailable, asgNeeds, asgOnClock, asgPick, asgTeams, startAsgDraft } from './asgDraft';
import { type AllStarResult, emptyAllStar, fbaPlayers } from './common';
import { contestPlayers, contestTurn, drawCounts, drawFilled, drawOnClock, startContestDraw } from './contestDraw';
import { rollOff } from './dice';
import { saveSelections, selectionProblems, suggestSelections } from './selection';
import { allStarRosters } from './testFixtures';

const seq = (...xs: number[]): Rng => { let k = 0; return () => xs[k++ % xs.length]; };
const ok = (r: AllStarResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.doc;
};
const fx = allStarRosters();
const list = fbaPlayers(fx.rosters, fx.players);
const posOf = (id: string) => list.find(p => p.playerId === id)!.position;

function selected(): AllStarFile {
  const sel = suggestSelections(list, new Map());
  const youngCaptains = list.filter(p => !sel.youngStars.includes(p.playerId)).slice(0, 4).map(p => p.playerId);
  return ok(saveSelections(null, { ...sel, youngCaptains }, 79, list, fx.players));
}

describe('rollOff', () => {
  it('separates tied ids with sudden-death 2d6 rolls', () => {
    const one = rollOff(['a', 'b'], seq(0.99, 0.99, 0, 0));
    expect(one.order).toEqual(['a', 'b']);
    expect(one.rollOff).toEqual({ ids: ['a', 'b'], rounds: [{ a: [6, 6], b: [1, 1] }] });
    const two = rollOff(['a', 'b'], seq(0.5, 0.5, 0.5, 0.5, 0, 0, 0.99, 0.99));
    expect(two.order).toEqual(['b', 'a']);
    expect(two.rollOff.rounds).toHaveLength(2);
  });
});

describe('selections', () => {
  it('lists every rated FBA player', () => {
    expect(list).toHaveLength(150);
    expect(list[0]).toEqual({ playerId: 'p10000', teamId: 'T0', position: 'PG', rating: 60, restricted: true, name: 'T0 PG' });
  });

  it('suggests 28 All-Stars and 20 Young-Stars within the position limits', () => {
    const sel = suggestSelections(list, new Map());
    expect(sel.allStars).toHaveLength(28);
    for (const pos of POSITIONS) {
      const n = sel.allStars.filter(id => posOf(id) === pos).length;
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(11);
      const y = sel.youngStars.filter(id => posOf(id) === pos).length;
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(7);
    }
    expect(sel.captains).toHaveLength(2);
    expect(sel.captains.every(c => sel.allStars.includes(c))).toBe(true);
    expect(sel.youngStars).toHaveLength(20);
    expect(sel.youngStars.every(id => list.find(p => p.playerId === id)!.restricted)).toBe(true);
    expect(sel.youngCaptains).toEqual([]);
  });

  it('explains what is wrong with a selection', () => {
    const sel = suggestSelections(list, new Map());
    expect(selectionProblems({ ...sel, allStars: sel.allStars.slice(1) }, list, fx.players)).toContain('Pick 28 All-Stars (have 27)');
    expect(selectionProblems(sel, list, fx.players)).toContain('Pick 4 Young-Star captains who are not Young-Stars');
    expect(selectionProblems({ ...sel, captains: [sel.allStars[0]] }, list, fx.players)).toContain('Pick 2 ASG captains from the All-Stars');
  });

  it('saves a valid selection, and locks it once the draft starts', () => {
    const doc = selected();
    expect(doc.selections!.allStars).toHaveLength(28);
    const drafting = ok(startAsgDraft(doc, seq(0)));
    expect(saveSelections(drafting, doc.selections!, 79, list, fx.players)).toEqual({
      ok: false, problems: ['Selections are locked once the All-Star draft starts'],
    });
  });
});

describe('ASG draft', () => {
  it('alternates from the coin-flip winner and makes the first 4 picks complete the starters', () => {
    let doc = ok(startAsgDraft(selected(), seq(0)));
    expect(doc.asgDraft).toEqual({ first: 0, picks: [] });
    expect(asgOnClock(doc)).toBe(0);
    const captain0 = doc.selections!.captains[0];
    expect(asgNeeds(doc, 0, list)).not.toContain(posOf(captain0));
    const samePos = doc.selections!.allStars.find(id => id !== captain0 && !doc.selections!.captains.includes(id) && posOf(id) === posOf(captain0))!;
    expect(asgPick(doc, samePos, list).ok).toBe(false);
    for (let k = 0; k < ASG_PICKS; k++) doc = ok(asgPick(doc, asgAvailable(doc, list)[0].playerId, list));
    expect(asgOnClock(doc)).toBeNull();
    const [a, b] = asgTeams(doc);
    expect(a).toHaveLength(14);
    expect(b).toHaveLength(14);
    for (const team of [a, b]) expect(new Set(team.slice(0, 5).map(posOf)).size).toBe(5);
  });
});

describe('contest draw', () => {
  it('walks teams in random order, allows passes, and redraws teams that passed', () => {
    let doc = ok(startContestDraw(emptyAllStar(79), fx.teamIds, mulberry32(2)));
    const order = doc.contestDraw!.order;
    expect([...order].sort()).toEqual([...fx.teamIds].sort());
    for (let k = 0; k < 30; k++) doc = ok(contestTurn(doc, null, list));
    expect(drawOnClock(doc)).toBe(order[0]);
    const first = list.find(p => p.teamId === order[0])!;
    doc = ok(contestTurn(doc, { contest: 'dunk', playerId: first.playerId }, list));
    expect(drawOnClock(doc)).toBe(order[1]);
    const wrongTeam = list.find(p => p.teamId === order[0])!;
    expect(contestTurn(doc, { contest: '5pt', playerId: wrongTeam.playerId }, list).ok).toBe(false);
  });

  it('fills 10 + 4 spots and then stops', () => {
    let doc = ok(startContestDraw(emptyAllStar(79), fx.teamIds, mulberry32(3)));
    while (!drawFilled(doc)) {
      const team = drawOnClock(doc)!;
      const counts = drawCounts(doc);
      const contest = counts['5pt'] < 10 ? '5pt' : 'dunk';
      doc = ok(contestTurn(doc, { contest, playerId: list.find(p => p.teamId === team)!.playerId }, list));
    }
    expect(drawCounts(doc)).toEqual({ '5pt': 10, dunk: 4 });
    expect(drawOnClock(doc)).toBeNull();
    expect(contestPlayers(doc, '5pt')).toHaveLength(10);
    expect(new Set(doc.contestDraw!.turns.filter(t => t.playerId).map(t => t.teamId)).size).toBe(14);
  });
});
