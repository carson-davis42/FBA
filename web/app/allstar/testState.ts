import { ASG_PICKS, asgAvailable, asgPick, startAsgDraft } from '../../engine/allstar/asgDraft';
import { type AllStarResult, fbaPlayers } from '../../engine/allstar/common';
import { contestTurn, drawCounts, drawFilled, drawOnClock, startContestDraw } from '../../engine/allstar/contestDraw';
import { runDunk, runFivePoint } from '../../engine/allstar/contests';
import { runAsg } from '../../engine/allstar/asgGame';
import { saveSelections, suggestSelections } from '../../engine/allstar/selection';
import { allStarRosters } from '../../engine/allstar/testFixtures';
import { runYoungStar, startYsgDraft, ysgAvailable, ysgPick } from '../../engine/allstar/youngStars';
import { mulberry32 } from '../../engine/d2/random';
import type { SeasonState } from '../../engine/season/state';
import type { AllStarFile } from '../../engine/shared/types';

export type Stage = 'none' | 'selected' | 'drafting' | 'drafted' | 'drawing' | 'drawn' | 'contests' | 'ysgDrafting' | 'ysgDrafted' | 'ysgPlayed' | 'complete';
const ORDER: Stage[] = ['none', 'selected', 'drafting', 'drafted', 'drawing', 'drawn', 'contests', 'ysgDrafting', 'ysgDrafted', 'ysgPlayed', 'complete'];

const ok = (r: AllStarResult): AllStarFile => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.doc;
};

/** A 30-team FBA season sitting at the All-Star pause (after game 12), with the All-Star doc advanced to `stage`. */
export function allStarSeasonState(stage: Stage): SeasonState {
  const fx = allStarRosters();
  const teams = { league: 'fba' as const, teams: fx.teamIds.map((t, k) => ({ teamId: t, name: `${t} Club`, abbr: t, group: k % 2 ? 'W' : 'E', logoFolder: null, badge: { bg: '#333', fg: '#fff' } })) };
  const games = Array.from({ length: 12 }, (_, k) => ({ gameNo: k + 1, home: 'T0', away: 'T1' }));
  const state: SeasonState = {
    league: 'fba', season: 79, teams, rosters: fx.rosters, players: fx.players,
    calendar: { season: 79, steps: [{ id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false }] },
    tx: { league: 'fba', season: 79, entries: [] },
    schedule: { league: 'fba', season: 79, locked: false, games, pauses: [{ afterGame: 12, kind: 'allstar', done: false }] },
    results: { league: 'fba', season: 79, locked: false, games: games.map(g => ({ ...g, homePts: 50, awayPts: 40 })) },
    ratingPause: null, allstar: null,
  };
  const at = ORDER.indexOf(stage);
  if (at === 0) return state;
  const list = fbaPlayers(fx.rosters, fx.players);
  const sel = suggestSelections(list, new Map());
  const youngCaptains = list.filter(p => !sel.youngStars.includes(p.playerId)).slice(0, 4).map(p => p.playerId);
  let doc = ok(saveSelections(null, { ...sel, youngCaptains }, 79, list, fx.players));
  if (at >= 2) doc = ok(startAsgDraft(doc, mulberry32(1)));
  if (at >= 3) for (let k = 0; k < ASG_PICKS; k++) doc = ok(asgPick(doc, asgAvailable(doc, list)[0].playerId, list));
  if (at >= 4) doc = ok(startContestDraw(doc, fx.teamIds, mulberry32(2)));
  if (at >= 5) {
    while (!drawFilled(doc)) {
      const team = drawOnClock(doc)!;
      const contest = drawCounts(doc)['5pt'] < 10 ? '5pt' : 'dunk';
      doc = ok(contestTurn(doc, { contest, playerId: list.find(p => p.teamId === team)!.playerId }, list));
    }
  }
  if (at >= 6) doc = ok(runDunk(ok(runFivePoint(doc, mulberry32(3))), mulberry32(4)));
  if (at >= 7) doc = ok(startYsgDraft(doc, mulberry32(5)));
  if (at >= 8) for (let k = 0; k < 20; k++) doc = ok(ysgPick(doc, ysgAvailable(doc, list)[0].playerId, list));
  if (at >= 9) doc = ok(runYoungStar(doc, mulberry32(6)));
  if (at >= 10) doc = ok(runAsg(doc, list, mulberry32(7)));
  return { ...state, allstar: doc };
}
