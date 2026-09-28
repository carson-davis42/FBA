import { randInt, type Rng } from '../d2/random';
import type { Dice, RollOff } from '../shared/types';

export const roll = (rng: Rng): Dice => [randInt(rng, 1, 6), randInt(rng, 1, 6)];
export const total = (d: Dice): number => d[0] + d[1];

/** Ranks tied ids best-first: everyone still tied rolls 2d6 each round until all are separated. */
export function rollOff(ids: string[], rng: Rng): { order: string[]; rollOff: RollOff } {
  const rounds: Record<string, Dice>[] = [];
  const rank = (group: string[]): string[] => {
    if (group.length <= 1) return group;
    const round: Record<string, Dice> = {};
    for (const id of group) round[id] = roll(rng);
    rounds.push(round);
    const bySum = new Map<number, string[]>();
    for (const id of group) {
      const s = total(round[id]);
      bySum.set(s, [...(bySum.get(s) ?? []), id]);
    }
    return [...bySum.keys()].sort((a, b) => b - a).flatMap(s => rank(bySum.get(s)!));
  };
  return { order: rank([...ids]), rollOff: { ids: [...ids], rounds } };
}
