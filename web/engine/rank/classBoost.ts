import type { ClassYear } from '../shared/types';

/** Rating points added when ordering draft prospects by the class they were in last season: younger and still rated high counts more. */
const BOOST: Record<ClassYear, number> = { Fr: 4, So: 2, Jr: 1, Sr: 0 };

export const classBoost = (classYear: ClassYear | null | undefined): number => (classYear ? BOOST[classYear] : 0);

/** `rating` plus the class boost; a missing rating stays missing. */
export function boosted(rating: number | null, classYear: ClassYear | null | undefined): number | null {
  return rating === null ? null : rating + classBoost(classYear);
}

/** A draft prospect's class from its ranking row's stat line ("So · DUKE"); null for any other line. */
export function classFromStat(stat: string | null): ClassYear | null {
  const m = stat?.match(/^(Fr|So|Jr|Sr) · /);
  return m ? (m[1] as ClassYear) : null;
}
