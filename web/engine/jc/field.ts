export const MAJOR_CONFERENCES = ['B12', 'ACC', 'BE', 'SEC', 'B10', 'AAC', 'P12', 'A10', 'MWC'];
export const isMajor = (conf: string): boolean => MAJOR_CONFERENCES.includes(conf);

/**
 * Port of the March Madness field loop (`MarchMadness.java` lines 55-125). `ranking` is the full blended order, best first;
 * `champions` are the conference tournament champions. Returns the 64 teams in the order the Java added them, and the
 * ranked teams left over (best first) for the NIT.
 */
export function selectMarchMadness(ranking: string[], champions: string[], confOf: (teamId: string) => string): { field: string[]; leftover: string[] } {
  const rankOf = new Map(ranking.map((t, i) => [t, i]));
  const byRank = (a: string, b: string): number => (rankOf.get(a) ?? Infinity) - (rankOf.get(b) ?? Infinity);
  const left = [...ranking];
  const champs = [...champions].sort(byRank);
  let majorLeft = champs.filter(t => isMajor(confOf(t))).length;
  const field: string[] = [];
  const remove = (list: string[], t: string): void => {
    const i = list.indexOf(t);
    if (i >= 0) list.splice(i, 1);
  };
  for (let a = 0; a < 64; a++) {
    if (champs.length >= 64 - a) {
      const t = champs.shift()!;
      field.push(t);
      remove(left, t);
      if (isMajor(confOf(t))) majorLeft--;
    } else if (majorLeft >= 52 - a && majorLeft > 0) {
      const t = champs.find(c => isMajor(confOf(c)))!;
      field.push(t);
      remove(left, t);
      remove(champs, t);
      majorLeft--;
    } else {
      let t = left[0];
      if (a >= 51) t = left.find(x => !isMajor(confOf(x))) ?? left[0];
      field.push(t);
      if (champs.includes(t)) {
        if (isMajor(confOf(t))) majorLeft--;
        remove(champs, t);
      }
      remove(left, t);
    }
  }
  return { field, leftover: left };
}

/**
 * The NIT field: every regular-season champion (co-champions included) that missed March Madness comes first, then the best of
 * the rest by ranking, 32 in all. `leftover` is the ranked list after the March Madness teams were taken. The result is in ranking order.
 */
export function selectNit(leftover: string[], rsChampions: string[]): { teams: string[]; warnings: string[] } {
  const champs = new Set(rsChampions);
  const guaranteed = leftover.filter(t => champs.has(t));
  const warnings: string[] = [];
  let picked: string[];
  if (guaranteed.length > 32) {
    picked = guaranteed.slice(0, 32);
    warnings.push(`${guaranteed.length} regular-season champions missed March Madness; only the best 32 by ranking get an NIT place`);
  } else {
    const rest = leftover.filter(t => !champs.has(t)).slice(0, 32 - guaranteed.length);
    picked = [...guaranteed, ...rest];
  }
  const keep = new Set(picked);
  return { teams: leftover.filter(t => keep.has(t)), warnings };
}

export interface FirstFourPair { id: string; group: 'power' | 'other'; teams: [string, string]; spot: number /* index in the 64-slot pick order */ }
export interface FirstFourPick {
  /** The 64 slots in pick order, a play-in spot holding the better-ranked team of its pair. */
  slots: string[];
  pairs: FirstFourPair[];
  firstFourIn: { power: string[]; other: string[] };
  firstFourOut: { power: string[]; other: string[] };
  /** Per group, the eight in ranking order. */
  lastEight: { power: string[]; other: string[] };
  /** Teams of `leftover` that remain after the 8 challengers. */
  leftover: string[];
  warnings: string[];
}

/**
 * The First Four: per group (power / other) the 4 worst spot holders of the 64 meet the first 4 of `leftover`, paired
 * adjacent by rank. A group with too few teams means no First Four (a 64-team field) and a warning.
 */
export function selectFirstFour(
  ranking: string[], field: string[], leftover: string[], confOf: (id: string) => string, protectedTeams: Set<string> = new Set(),
): FirstFourPick {
  const rankOf = new Map(ranking.map((t, i) => [t, i]));
  const byRank = (a: string, b: string): number => (rankOf.get(a) ?? Infinity) - (rankOf.get(b) ?? Infinity);
  const slots = [...field];
  const groups: ('power' | 'other')[] = ['power', 'other'];
  const inGroup = (t: string, g: 'power' | 'other'): boolean => isMajor(confOf(t)) === (g === 'power');
  const picked = {} as Record<'power' | 'other', { holders: string[]; challengers: string[]; above: string[]; out: string[] }>;
  for (const g of groups) {
    const members = field.filter(t => inGroup(t, g)).sort(byRank);
    // A protected team (a regular-season champion) never plays in: it keeps its direct spot, or stays in the leftover for the NIT.
    const playable = members.filter(t => !protectedTeams.has(t));
    const pool = leftover.filter(t => inGroup(t, g) && !protectedTeams.has(t));
    if (members.length < 8 || playable.length < 4 || pool.length < 4) {
      return {
        slots, pairs: [], firstFourIn: { power: [], other: [] }, firstFourOut: { power: [], other: [] },
        lastEight: { power: [], other: [] }, leftover: [...leftover],
        warnings: [`There are too few ${g === 'power' ? 'power-conference' : 'other-conference'} teams for a First Four; March Madness has 64 teams`],
      };
    }
    const holders = playable.slice(-4);
    const worst = members.indexOf(holders[0]);
    picked[g] = { holders, challengers: pool.slice(0, 4), above: members.slice(Math.max(0, worst - 4), worst), out: pool.slice(4, 8) };
  }
  const pairs: FirstFourPair[] = [];
  const lastEight: FirstFourPick['lastEight'] = { power: [], other: [] };
  const spotsOf: Record<string, number[]> = {};
  for (const g of groups) spotsOf[g] = picked[g].holders.map(t => field.indexOf(t)).sort((a, b) => a - b);
  for (const g of groups) {
    const eight = [...picked[g].holders, ...picked[g].challengers].sort(byRank);
    lastEight[g] = eight;
    for (let k = 0; k < 4; k++) {
      pairs.push({ id: '', group: g, teams: [eight[2 * k], eight[2 * k + 1]], spot: spotsOf[g][k] });
      slots[spotsOf[g][k]] = eight[2 * k];
    }
  }
  pairs.forEach((p, i) => { p.id = `P${i + 1}`; });
  const taken = new Set(groups.flatMap(g => picked[g].challengers));
  return {
    slots, pairs,
    firstFourIn: { power: picked.power.above, other: picked.other.above },
    firstFourOut: { power: picked.power.out, other: picked.other.out },
    lastEight,
    leftover: leftover.filter(t => !taken.has(t)),
    warnings: [],
  };
}
