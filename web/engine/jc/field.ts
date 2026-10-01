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
