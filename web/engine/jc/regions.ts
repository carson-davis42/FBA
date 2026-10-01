import type { Bracket } from '../shared/types';
import { buildBracket, type NewGame } from './bracket';

/** Port of `MarchMadness.addToRegions` (lines 313-560): puts one seed line (four teams) into the four regions, keeping same-conference teams apart. `seed` is the 0-based seed index (seed number - 1). */
function addToRegions(thisSeed: string[], seed: number, regions: string[][], confOf: (id: string) => string): void {
  const firstOpp = 15 - seed;
  let secondOppHigh: number;
  let highestInGroup: number;
  if (firstOpp > seed) {
    secondOppHigh = 7 - seed;
    highestInGroup = Math.min(seed, secondOppHigh);
  } else {
    secondOppHigh = 7 - firstOpp;
    highestInGroup = Math.min(firstOpp, secondOppHigh);
  }
  const secondOppLow = 15 - secondOppHigh;
  const third1High = 3 - highestInGroup;
  const third2High = 7 - third1High;
  const third1Low = 15 - third1High;
  const third2Low = 15 - third2High;

  const pool = [...thisSeed];
  const help: number[][] = [];
  for (const t of pool) {
    const conf = confOf(t);
    const same = (reg: string[], i: number): boolean => reg.length > i && confOf(reg[i]) === conf;
    help.push(regions.map(reg => {
      let round = 4;
      if (same(reg, third2Low) || same(reg, third2High) || same(reg, third1Low) || same(reg, third1High)) round = 3;
      if (same(reg, secondOppLow) || same(reg, secondOppHigh)) round = 2;
      if (same(reg, firstOpp)) round = 1;
      return round;
    }));
  }

  const taken = [false, false, false, false];
  const third: string[] = [];
  const second: string[] = [];
  const first: string[] = [];
  pool.forEach((t, i) => {
    const worst = Math.min(4, ...help[i]);
    if (worst === 3 || worst === 2 || worst === 1) third.push(t);
    if (worst === 2 || worst === 1) second.push(t);
    if (worst === 1) first.push(t);
  });

  const drop = (list: string[], t: string): void => {
    const i = list.indexOf(t);
    if (i >= 0) list.splice(i, 1);
  };
  const tryPlace = (t: string, level: number, alsoDrop: string[][]): void => {
    const index = pool.indexOf(t);
    const reg = help[index];
    const k = [0, 1, 2, 3].find(r => !taken[r] && reg[r] !== level);
    if (k === undefined) return;
    regions[k].push(t);
    taken[k] = true;
    pool.splice(index, 1);
    help.splice(index, 1);
    for (const list of alsoDrop) drop(list, t);
  };
  for (const t of [...first]) tryPlace(t, 1, [second, third]);
  for (const t of [...second]) tryPlace(t, 2, [third]);
  for (const t of [...third]) tryPlace(t, 3, []);
  for (const t of pool) {
    const k = [0, 1, 2].find(r => !taken[r]) ?? 3;
    regions[k].push(t);
    taken[k] = true;
  }
}

/** Port of `MarchMadness.java` lines 127-200: `field` is the 64 teams in pick order. Regions come back in the Java's slot order (index = seed - 1). */
export function placeRegions(field: string[], confOf: (id: string) => string): { seeds: Record<string, number>; regions: string[][] } {
  if (field.length !== 64) throw new Error('A March Madness field has 64 teams');
  const rest = [...field];
  const seeds: Record<string, number> = {};
  const regions: string[][] = [[], [], [], []];
  for (let a = 0; a < 8; a++) {
    const seed = a < 4 ? 1 : 2;
    const t = rest.shift()!;
    regions[seed === 1 ? a % 4 : 3 - (a % 4)].push(t);
    seeds[t] = seed;
  }
  for (let a = 0; a < 14; a++) {
    const line = [rest.shift()!, rest.shift()!, rest.shift()!, rest.shift()!];
    for (const t of line) seeds[t] = a + 3;
    addToRegions(a % 2 === 1 ? [...line].reverse() : line, a + 2, regions, confOf);
  }
  return { seeds, regions };
}

const TOP = [0, 7, 4, 3, 2, 5, 6, 1];
const BOTTOM = [15, 8, 11, 12, 13, 10, 9, 14];
const NEXT: [number, 'home' | 'away'][] = [
  [8, 'home'], [8, 'away'], [9, 'away'], [9, 'home'], [10, 'home'], [10, 'away'], [11, 'away'], [11, 'home'],
  [12, 'home'], [12, 'away'], [13, 'away'], [13, 'home'], [14, 'home'], [14, 'away'],
];
const roundOf = (g: number): number => (g < 8 ? 1 : g < 12 ? 2 : g < 14 ? 3 : 4);
/** Which Final Four game (and side) each region's champion goes to: regions 1 and 4 meet, and regions 2 and 3. */
const FINAL_FOUR: [string, 'home' | 'away'][] = [['FF1', 'home'], ['FF2', 'home'], ['FF2', 'away'], ['FF1', 'away']];

/** The 63-game bracket in the Java layout (`bracket1`..`bracket4`, `decideWhereGo`). Game ids R<region>-<1..15>, FF1, FF2, NC. */
export function buildMarchMadness(regions: string[][], seeds: Record<string, number>): Bracket {
  const games: NewGame[] = [];
  regions.forEach((reg, k) => {
    for (let g = 0; g < 15; g++) {
      const home = g < 8 ? reg[TOP[g]] : null;
      const away = g < 8 ? reg[BOTTOM[g]] : null;
      const next = g < 14 ? { id: `R${k + 1}-${NEXT[g][0] + 1}`, side: NEXT[g][1] } : { id: FINAL_FOUR[k][0], side: FINAL_FOUR[k][1] };
      games.push({
        id: `R${k + 1}-${g + 1}`, round: roundOf(g), region: k, home, away,
        homeSeed: home ? seeds[home] : null, awaySeed: away ? seeds[away] : null, next,
      });
    }
  });
  const open = { home: null, away: null, homeSeed: null, awaySeed: null, region: 0 };
  games.push({ id: 'FF1', round: 5, ...open, next: { id: 'NC', side: 'home' } });
  games.push({ id: 'FF2', round: 5, ...open, next: { id: 'NC', side: 'away' } });
  games.push({ id: 'NC', round: 6, ...open, next: null });
  return buildBracket('MM', 'mm', 'March Madness', games);
}
