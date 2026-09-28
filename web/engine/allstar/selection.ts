import { POSITIONS } from '../roster/rules';
import type { AllStarFile, AllStarSelections, PlayersFile } from '../shared/types';
import { allStarFail, type AllStarResult, emptyAllStar, type FbaPlayer } from './common';

export const ALL_STAR_COUNT = 28;
export const ALL_STAR_LIMITS = { min: 4, max: 11 };
export const YOUNG_COUNT = 20;
export const YOUNG_LIMITS = { min: 2, max: 7 };

/** Takes the first `min` at each position, then fills to `count` in list order without passing `max` at any position. */
function pickWithin(candidates: FbaPlayer[], count: number, limits: { min: number; max: number }): string[] {
  const chosen = new Set<string>();
  const perPos = new Map<string, number>();
  const add = (p: FbaPlayer) => {
    chosen.add(p.playerId);
    perPos.set(p.position, (perPos.get(p.position) ?? 0) + 1);
  };
  for (const pos of POSITIONS) candidates.filter(p => p.position === pos).slice(0, limits.min).forEach(add);
  for (const p of candidates) {
    if (chosen.size >= count) break;
    if (!chosen.has(p.playerId) && (perPos.get(p.position) ?? 0) < limits.max) add(p);
  }
  return candidates.filter(p => chosen.has(p.playerId)).map(p => p.playerId);
}

/** App suggestion: All-Stars by rating (PPG breaks ties); Young-Stars from rookie-deal players first. */
export function suggestSelections(list: FbaPlayer[], ppg: Map<string, number>): AllStarSelections {
  const best = [...list].sort((a, b) =>
    b.rating - a.rating || (ppg.get(b.playerId) ?? 0) - (ppg.get(a.playerId) ?? 0) || a.name.localeCompare(b.name));
  const allStars = pickWithin(best, ALL_STAR_COUNT, ALL_STAR_LIMITS);
  const youngPool = [...best.filter(p => p.restricted), ...best.filter(p => !p.restricted)];
  return {
    allStars,
    captains: allStars.slice(0, 2),
    youngStars: pickWithin(youngPool, YOUNG_COUNT, YOUNG_LIMITS),
    youngCaptains: [],
  };
}

function groupProblems(label: string, ids: string[], count: number, limits: { min: number; max: number }, byId: Map<string, FbaPlayer>): string[] {
  const out: string[] = [];
  if (ids.length !== count) out.push(`Pick ${count} ${label} (have ${ids.length})`);
  if (new Set(ids).size !== ids.length) out.push(`${label}: someone is listed twice`);
  if (ids.some(id => !byId.has(id))) out.push(`${label}: everyone must be on an FBA roster`);
  for (const pos of POSITIONS) {
    const n = ids.filter(id => byId.get(id)?.position === pos).length;
    if (n < limits.min || n > limits.max) out.push(`${label}: ${pos} has ${n} (needs ${limits.min}–${limits.max})`);
  }
  return out;
}

export function selectionProblems(sel: AllStarSelections, list: FbaPlayer[], registry: PlayersFile): string[] {
  const byId = new Map(list.map(p => [p.playerId, p]));
  const out = [
    ...groupProblems('All-Stars', sel.allStars, ALL_STAR_COUNT, ALL_STAR_LIMITS, byId),
    ...groupProblems('Young-Stars', sel.youngStars, YOUNG_COUNT, YOUNG_LIMITS, byId),
  ];
  if (sel.captains.length !== 2 || new Set(sel.captains).size !== 2 || !sel.captains.every(c => sel.allStars.includes(c))) {
    out.push('Pick 2 ASG captains from the All-Stars');
  }
  const yc = sel.youngCaptains;
  if (yc.length !== 4 || new Set(yc).size !== 4 || yc.some(id => !registry.players[id] || sel.youngStars.includes(id))) {
    out.push('Pick 4 Young-Star captains who are not Young-Stars');
  }
  return out;
}

export function saveSelections(doc: AllStarFile | null, sel: AllStarSelections, season: number, list: FbaPlayer[], registry: PlayersFile): AllStarResult {
  if (doc?.asgDraft) return allStarFail(['Selections are locked once the All-Star draft starts']);
  const problems = selectionProblems(sel, list, registry);
  if (problems.length) return allStarFail(problems);
  return { ok: true, doc: { ...(doc ?? emptyAllStar(season)), selections: sel }, label: 'Save All-Star selections' };
}
