import type { Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, Position } from '../shared/types';
import { asgTeams } from './asgDraft';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';
import { playExhibition, type Roster, topScorer } from './exhibition';

const PATTERN: Record<number, number[]> = { 1: [0, 0, 0, 0], 2: [0, 1, 1, 0], 3: [0, 1, 2, 0] };

/**
 * Quarter lineups, one player per position, from a team's members in draft order (captain first).
 * Per position: 1 → 1,1,1,1; 2 → 1,2,2,1; 3 → 1,2,3,1; 4+ → 1,2,3,4. A 5th player at a position plays Q3,
 * and 6th+ play Q2, at the nearest position whose slot that quarter is a repeat (a player who also plays
 * another quarter there) or empty; among equally near positions, the one with fewer players, then the guard side.
 */
export function asgLineups(members: { playerId: string; position: Position }[]): { playerId: string; slot: Position }[][] {
  const byPos = POSITIONS.map(pos => members.filter(m => m.position === pos).map(m => m.playerId));
  const quarters: (string | null)[][] = [0, 1, 2, 3].map(() => POSITIONS.map(() => null));
  byPos.forEach((list, pi) => {
    if (!list.length) return;
    const pat = list.length >= 4 ? [0, 1, 2, 3] : PATTERN[list.length];
    for (let q = 0; q < 4; q++) quarters[q][pi] = list[pat[q]];
  });
  const count = (pi: number, id: string | null) => (id === null ? 0 : quarters.filter(qr => qr[pi] === id).length);
  const open = (q: number, pj: number) => quarters[q][pj] === null || count(pj, quarters[q][pj]) > 1;
  const extras = members
    .map(m => ({ ...m, pi: POSITIONS.indexOf(m.position), k: byPos[POSITIONS.indexOf(m.position)].indexOf(m.playerId) }))
    .filter(m => m.k >= 4);
  for (const x of extras) {
    const q = x.k === 4 ? 2 : 1;
    const candidates = POSITIONS.map((_, pj) => pj)
      .filter(pj => pj !== x.pi && open(q, pj))
      .sort((a, b) => Math.abs(a - x.pi) - Math.abs(b - x.pi) || byPos[a].length - byPos[b].length || a - b);
    if (candidates.length) quarters[q][candidates[0]] = x.playerId;
  }
  return quarters.map(qr => qr.flatMap((id, pi) => (id ? [{ playerId: id, slot: POSITIONS[pi] }] : [])));
}

/** The All-Star Game: four quarters on the game engine, each side rotating its lineups as `asgLineups` sets them (overtime is the starters). The MVP is the winning team's top scorer. */
export function runAsg(doc: AllStarFile, list: FbaPlayer[], rng: Rng): AllStarResult {
  if (!doc.ysg) return allStarFail(['Play the Young-Star tournament first']);
  if (doc.asg) return allStarFail(['The All-Star Game has already been played']);
  const teams = asgTeams(doc);
  const rosters: Roster[] = [];
  const rotation: number[][][] = [];
  for (const ids of teams) {
    const info = new Map(ids.map(id => [id, list.find(p => p.playerId === id)]));
    if ([...info.values()].some(p => !p)) return allStarFail(['Every All-Star must be on an FBA roster']);
    const quarters = asgLineups(ids.map(id => ({ playerId: id, position: info.get(id)!.position })));
    if (quarters.some(q => q.length !== 5)) return allStarFail(['Each team needs a player at every position']);
    rosters.push(ids.map(id => ({ playerId: id, position: info.get(id)!.position, rating: info.get(id)!.rating })));
    rotation.push(quarters.map(q => q.map(sl => ids.indexOf(sl.playerId))));
  }
  const game = playExhibition([0, 1], [rosters[0], rosters[1]], [rotation[0], rotation[1]], rng);
  const mvp = topScorer([game], teams[game.winner], rng);
  return { ok: true, doc: { ...doc, asg: { game, mvp } }, label: 'Play the All-Star Game' };
}
