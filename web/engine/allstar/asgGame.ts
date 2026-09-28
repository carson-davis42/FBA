import type { Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, DiceRoll, Position, RollOff } from '../shared/types';
import { asgTeams } from './asgDraft';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';
import { roll, rollOff, total } from './dice';

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

export function runAsg(doc: AllStarFile, list: FbaPlayer[], rng: Rng): AllStarResult {
  if (!doc.ysg) return allStarFail(['Play the Young-Star tournament first']);
  if (doc.asg) return allStarFail(['The All-Star Game has already been played']);
  const teams = asgTeams(doc);
  const lineups = teams.map(ids => asgLineups(ids.map(id => ({ playerId: id, position: list.find(p => p.playerId === id)!.position }))));
  const rolls: DiceRoll[][] = [];
  const scores: [number, number] = [0, 0];
  const byPlayer = new Map<string, number>();
  for (let q = 0; q < 4; q++) {
    const period: DiceRoll[] = [];
    for (const team of [0, 1]) {
      for (const slot of lineups[team][q]) {
        const dice = roll(rng);
        period.push({ team, playerId: slot.playerId, dice });
        scores[team] += total(dice);
        byPlayer.set(slot.playerId, (byPlayer.get(slot.playerId) ?? 0) + total(dice));
      }
    }
    rolls.push(period);
  }
  let winner: number;
  let gameRollOff: RollOff | null = null;
  if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  else {
    const r = rollOff(['0', '1'], rng);
    winner = Number(r.order[0]);
    gameRollOff = r.rollOff;
  }
  const winners = teams[winner].filter(id => byPlayer.has(id));
  const best = Math.max(...winners.map(id => byPlayer.get(id)!));
  const top = winners.filter(id => byPlayer.get(id) === best);
  let mvp = top[0];
  let mvpRollOff: RollOff | null = null;
  if (top.length > 1) {
    const r = rollOff(top, rng);
    mvp = r.order[0];
    mvpRollOff = r.rollOff;
  }
  return {
    ok: true,
    doc: { ...doc, asg: { game: { teams: [0, 1], rolls, scores, rollOff: gameRollOff, winner }, mvp, mvpRollOff } },
    label: 'Play the All-Star Game',
  };
}
