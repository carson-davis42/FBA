import { shuffle, type Rng } from '../d2/random';
import type { AllStarFile } from '../shared/types';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';
import { lineupOf, playExhibition, type Roster, topScorer } from './exhibition';

export const YSG_PICKS = 20;

export function startYsgDraft(doc: AllStarFile, rng: Rng): AllStarResult {
  if (!doc.selections) return allStarFail(['Save the selections first']);
  if (doc.ysgDraft) return allStarFail(['The Young-Star draft has already started']);
  return { ok: true, doc: { ...doc, ysgDraft: { order: shuffle([0, 1, 2, 3], rng), picks: [] } }, label: 'Start Young-Star draft' };
}

/** Snake draft: even rounds follow `order`, odd rounds reverse it. */
export function ysgTeamOf(order: number[], k: number): number {
  const round = Math.floor(k / 4);
  const pos = k % 4;
  return round % 2 === 0 ? order[pos] : order[3 - pos];
}

export function ysgOnClock(doc: AllStarFile): number | null {
  const d = doc.ysgDraft;
  if (!d || d.picks.length >= YSG_PICKS) return null;
  return ysgTeamOf(d.order, d.picks.length);
}

export function ysgTeams(doc: AllStarFile): string[][] {
  const teams: string[][] = [[], [], [], []];
  const d = doc.ysgDraft;
  d?.picks.forEach((id, k) => teams[ysgTeamOf(d.order, k)].push(id));
  return teams;
}

/** Young-Stars not yet picked, best first. Any position may be taken: the pool isn't four of each. */
export function ysgAvailable(doc: AllStarFile, list: FbaPlayer[]): FbaPlayer[] {
  if (ysgOnClock(doc) === null || !doc.selections || !doc.ysgDraft) return [];
  const taken = new Set(doc.ysgDraft.picks);
  return doc.selections.youngStars.filter(id => !taken.has(id)).map(id => list.find(p => p.playerId === id)!).filter(Boolean)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

export function ysgPick(doc: AllStarFile, playerId: string, list: FbaPlayer[]): AllStarResult {
  if (ysgOnClock(doc) === null) return allStarFail(['The Young-Star draft is not open']);
  if (!ysgAvailable(doc, list).some(p => p.playerId === playerId)) {
    return allStarFail(["That player can't be picked now (already taken or not a Young-Star)"]);
  }
  const d = doc.ysgDraft!;
  return { ok: true, doc: { ...doc, ysgDraft: { ...d, picks: [...d.picks, playerId] } }, label: `Young-Star draft pick ${d.picks.length + 1}` };
}

/**
 * A four-team tournament on the game engine: the teams are drawn at random into two semifinals, and the winners play the final. Each
 * team's five drafted players play the whole game. The MVP is the champion's top scorer across its games (a tie is a random pick).
 */
export function runYoungStar(doc: AllStarFile, list: FbaPlayer[], rng: Rng): AllStarResult {
  if (!doc.ysgDraft || doc.ysgDraft.picks.length < YSG_PICKS) return allStarFail(['Finish the Young-Star draft first']);
  if (doc.ysg) return allStarFail(['The Young-Star tournament has already been played']);
  const members = ysgTeams(doc);
  const rosters: Roster[] = [];
  for (const ids of members) {
    const players = ids.map(id => list.find(p => p.playerId === id));
    if (players.some(p => !p)) return allStarFail(['Every Young-Star must be on an FBA roster']);
    rosters.push(lineupOf(players.map(p => ({ playerId: p!.playerId, position: p!.position, rating: p!.rating }))));
  }
  const all = [[0, 1, 2, 3, 4]];
  const play = (a: number, b: number) => playExhibition([a, b], [rosters[a], rosters[b]], [all, all], rng);
  const [a, b, c, d] = shuffle([0, 1, 2, 3], rng);
  const semis = [play(a, b), play(c, d)];
  const final = play(semis[0].winner, semis[1].winner);
  const mvp = topScorer([...semis, final], members[final.winner], rng);
  return { ok: true, doc: { ...doc, ysg: { semis, final, champion: final.winner, mvp } }, label: 'Run the Young-Star tournament' };
}
