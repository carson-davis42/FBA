import type { JcPostseasonFile } from '../shared/types';

type Field = NonNullable<JcPostseasonFile['field']>;

/** One reveal on Selection Sunday: a spot of a region (seed 1 down to 16), one of the bubble lists, or an NIT team. */
export type RevealStep =
  | { kind: 'spot'; region: number; id: string }
  | { kind: 'bubble'; section: 'in' | 'eight' | 'out' }
  | { kind: 'nit'; id: string };

/** Changes whenever the field does (a re-draw or a swap), so a saved reveal does not carry over to a different field. */
export const fieldFingerprint = (f: Field): string =>
  [...f.mm.teams, '|', ...f.mm.firstFour.flatMap(g => g.teams), '|', ...f.nit.teams].join(',');

/** The reveal order: region by region, seed by seed; then First Four In, Last Eight In and First Four Out; then the NIT field. */
export function revealPlan(f: Field): RevealStep[] {
  const steps: RevealStep[] = [];
  f.mm.regions.forEach((reg, region) => {
    [...reg].sort((a, b) => f.mm.seeds[a] - f.mm.seeds[b]).forEach(id => steps.push({ kind: 'spot', region, id }));
  });
  for (const section of ['in', 'eight', 'out'] as const) steps.push({ kind: 'bubble', section });
  f.nit.teams.forEach(id => steps.push({ kind: 'nit', id }));
  return steps;
}
