import { shuffle, type Rng } from '../d2/random';
import type { AllStarFile } from '../shared/types';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';

export const CONTEST_SPOTS = { '5pt': 10, dunk: 4 } as const;
export type Contest = keyof typeof CONTEST_SPOTS;

export function startContestDraw(doc: AllStarFile, teamIds: string[], rng: Rng): AllStarResult {
  if (doc.contestDraw) return allStarFail(['The contest draw has already started']);
  return { ok: true, doc: { ...doc, contestDraw: { order: shuffle(teamIds, rng), turns: [] } }, label: 'Start contest draw' };
}

export function drawCounts(doc: AllStarFile): Record<Contest, number> {
  const turns = doc.contestDraw?.turns ?? [];
  return { '5pt': turns.filter(t => t.contest === '5pt').length, dunk: turns.filter(t => t.contest === 'dunk').length };
}

export function drawFilled(doc: AllStarFile): boolean {
  const c = drawCounts(doc);
  return c['5pt'] >= CONTEST_SPOTS['5pt'] && c.dunk >= CONTEST_SPOTS.dunk;
}

/** The team drawn next: first through the random order, then again through teams that have not sent anyone. */
export function drawOnClock(doc: AllStarFile): string | null {
  const draw = doc.contestDraw;
  if (!draw || drawFilled(doc)) return null;
  const sent = new Set<string>();
  let idx = 0;
  let pass = draw.order;
  for (;;) {
    for (const team of pass) {
      if (idx === draw.turns.length) return team;
      const t = draw.turns[idx++];
      if (t.playerId) sent.add(t.teamId);
    }
    pass = draw.order.filter(t => !sent.has(t));
    if (!pass.length) return null;
  }
}

export function contestTurn(doc: AllStarFile, choice: { contest: Contest; playerId: string } | null, list: FbaPlayer[]): AllStarResult {
  const team = drawOnClock(doc);
  if (!team || !doc.contestDraw) return allStarFail(['The contest draw is not open']);
  const d = doc.contestDraw;
  if (!choice) {
    return { ok: true, doc: { ...doc, contestDraw: { ...d, turns: [...d.turns, { teamId: team, contest: null, playerId: null }] } }, label: `Contest draw: ${team} passes` };
  }
  const player = list.find(p => p.playerId === choice.playerId && p.teamId === team);
  if (!player) return allStarFail([`That player is not on ${team}`]);
  if (drawCounts(doc)[choice.contest] >= CONTEST_SPOTS[choice.contest]) return allStarFail([`The ${choice.contest} contest is full`]);
  const what = choice.contest === '5pt' ? '5pt contest' : 'dunk contest';
  return {
    ok: true,
    doc: { ...doc, contestDraw: { ...d, turns: [...d.turns, { teamId: team, contest: choice.contest, playerId: choice.playerId }] } },
    label: `Contest draw: ${team} sends ${player.name} to the ${what}`,
  };
}

export function contestPlayers(doc: AllStarFile, contest: Contest): string[] {
  return (doc.contestDraw?.turns ?? []).filter(t => t.contest === contest && t.playerId).map(t => t.playerId!);
}
