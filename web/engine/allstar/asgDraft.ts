import { randInt, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, Position } from '../shared/types';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';

export const ASG_PICKS = 26;

export function startAsgDraft(doc: AllStarFile, rng: Rng): AllStarResult {
  if (!doc.selections) return allStarFail(['Save the selections first']);
  if (doc.asgDraft) return allStarFail(['The All-Star draft has already started']);
  const first = randInt(rng, 0, 1) as 0 | 1;
  return { ok: true, doc: { ...doc, asgDraft: { first, picks: [] } }, label: 'Start All-Star draft (coin flip)' };
}

const teamOfPick = (first: 0 | 1, k: number): 0 | 1 => ((first + k) % 2) as 0 | 1;

/** Each team's members in draft order: its captain first, then its picks. */
export function asgTeams(doc: AllStarFile): [string[], string[]] {
  const captains = doc.selections?.captains ?? [];
  const teams: [string[], string[]] = [captains[0] ? [captains[0]] : [], captains[1] ? [captains[1]] : []];
  const d = doc.asgDraft;
  d?.picks.forEach((id, k) => teams[teamOfPick(d.first, k)].push(id));
  return teams;
}

export function asgOnClock(doc: AllStarFile): 0 | 1 | null {
  const d = doc.asgDraft;
  if (!d || d.picks.length >= ASG_PICKS) return null;
  return teamOfPick(d.first, d.picks.length);
}

/** Positions a team must still fill with its first 4 picks so captain + those picks are one per position. */
export function asgNeeds(doc: AllStarFile, team: 0 | 1, list: FbaPlayer[]): Position[] {
  const members = asgTeams(doc)[team];
  if (members.length >= 5) return [];
  const have = new Set(members.map(id => list.find(p => p.playerId === id)?.position));
  return POSITIONS.filter(p => !have.has(p));
}

export function asgAvailable(doc: AllStarFile, list: FbaPlayer[]): FbaPlayer[] {
  const team = asgOnClock(doc);
  if (team === null || !doc.selections) return [];
  const taken = new Set([...doc.selections.captains, ...(doc.asgDraft?.picks ?? [])]);
  const needs = asgNeeds(doc, team, list);
  return doc.selections.allStars
    .filter(id => !taken.has(id))
    .map(id => list.find(p => p.playerId === id)!)
    .filter(p => p && (needs.length === 0 || needs.includes(p.position)))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

export function asgPick(doc: AllStarFile, playerId: string, list: FbaPlayer[]): AllStarResult {
  if (asgOnClock(doc) === null) return allStarFail(['The All-Star draft is not open']);
  if (!asgAvailable(doc, list).some(p => p.playerId === playerId)) {
    return allStarFail(["That player can't be picked now (already taken, not an All-Star, or the team still needs a starter at another position)"]);
  }
  const d = doc.asgDraft!;
  return { ok: true, doc: { ...doc, asgDraft: { ...d, picks: [...d.picks, playerId] } }, label: `All-Star draft pick ${d.picks.length + 1}` };
}
