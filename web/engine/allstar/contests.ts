import type { Rng } from '../d2/random';
import type { AllStarFile, ContestResult, ContestRound, Dice, RollOff } from '../shared/types';
import { allStarFail, type AllStarResult } from './common';
import { type Contest, contestPlayers, drawFilled } from './contestDraw';
import { roll, rollOff, total } from './dice';

export const CONTEST_CUTS: Record<Contest, number[]> = { '5pt': [5, 3, 1], dunk: [3, 2, 1] };

/** The top `cut` by total; a tie across the line is settled by a roll-off among the tied. */
export function cutField(ids: string[], totals: Record<string, number>, cut: number, rng: Rng): { advanced: string[]; rollOffs: RollOff[] } {
  const sorted = [...ids].sort((a, b) => totals[b] - totals[a]);
  if (sorted.length <= cut) return { advanced: sorted, rollOffs: [] };
  const line = totals[sorted[cut - 1]];
  if (totals[sorted[cut]] !== line) return { advanced: sorted.slice(0, cut), rollOffs: [] };
  const above = sorted.filter(id => totals[id] > line);
  const tied = sorted.filter(id => totals[id] === line);
  const r = rollOff(tied, rng);
  return { advanced: [...above, ...r.order.slice(0, cut - above.length)], rollOffs: [r.rollOff] };
}

/** Each round every remaining player rolls 3 times, added to a running total; `cuts` says how many survive each round. */
export function runContest(players: string[], cuts: number[], rng: Rng): ContestResult {
  const totals: Record<string, number> = Object.fromEntries(players.map(p => [p, 0]));
  let alive = [...players];
  const rounds: ContestRound[] = [];
  for (const cut of cuts) {
    const rolls: Record<string, Dice[]> = {};
    for (const p of alive) {
      rolls[p] = [roll(rng), roll(rng), roll(rng)];
      totals[p] += rolls[p].reduce((s, d) => s + total(d), 0);
    }
    const { advanced, rollOffs } = cutField(alive, totals, cut, rng);
    rounds.push({ players: alive, rolls, totals: Object.fromEntries(alive.map(p => [p, totals[p]])), advanced, rollOffs });
    alive = advanced;
  }
  return { rounds, winner: alive[0] };
}

function run(doc: AllStarFile, contest: Contest, rng: Rng): AllStarResult {
  if (!drawFilled(doc)) return allStarFail(['Finish the contest draw first']);
  if (contest === '5pt' ? doc.fivePoint : doc.dunk) return allStarFail([`The ${contest} contest has already been run`]);
  const result = runContest(contestPlayers(doc, contest), CONTEST_CUTS[contest], rng);
  return contest === '5pt'
    ? { ok: true, doc: { ...doc, fivePoint: result }, label: 'Run the 5pt contest' }
    : { ok: true, doc: { ...doc, dunk: result }, label: 'Run the dunk contest' };
}

export const runFivePoint = (doc: AllStarFile, rng: Rng) => run(doc, '5pt', rng);
export const runDunk = (doc: AllStarFile, rng: Rng) => run(doc, 'dunk', rng);
