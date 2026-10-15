import type { JcPostseasonFile } from '../shared/types';
import { BOTTOM, TOP } from './regions';

type Field = NonNullable<JcPostseasonFile['field']>;

/** One reveal on Selection Sunday: a spot of a region (seed 1 down to 16), one of the bubble lists, or an NIT team. */
export type RevealStep =
  | { kind: 'spot'; region: number; id: string }
  | { kind: 'bubble'; section: 'in' | 'eight' | 'out' }
  | { kind: 'nit'; id: string };

/** Changes whenever the field does (a re-draw or a swap), so a saved reveal does not carry over to a different field. */
export const fieldFingerprint = (f: Field): string =>
  [...f.mm.teams, '|', ...f.mm.firstFour.flatMap(g => g.teams), '|', ...f.nit.teams].join(',');

/** The reveal order: region 1 to 4, top to bottom of each; then First Four In, Last Eight In and First Four Out; then the NIT field. */
export function revealPlan(f: Field): RevealStep[] {
  const steps: RevealStep[] = [];
  // Each region top to bottom of the bracket: game 1's two teams (1 and 16), then game 2's (8 and 9), and so on.
  f.mm.regions.forEach((reg, region) => {
    TOP.forEach((top, g) => {
      steps.push({ kind: 'spot', region, id: reg[top] });
      steps.push({ kind: 'spot', region, id: reg[BOTTOM[g]] });
    });
  });
  for (const section of ['in', 'eight', 'out'] as const) steps.push({ kind: 'bubble', section });
  f.nit.teams.forEach(id => steps.push({ kind: 'nit', id }));
  return steps;
}
