/** A rating with an age bonus, for ordering draft prospects: one point per year under 22 (and one off per year over), ages taken as 18 to 26. */
export const AGE_BASELINE = 22;
const MIN_AGE = 18;
const MAX_AGE = 26;
const POINTS_PER_YEAR = 1;

/** `rating` plus the age adjustment; no adjustment when the age is unknown, and null without a rating. */
export function ageAdjusted(rating: number | null, age: number | null): number | null {
  if (rating === null) return null;
  if (age === null) return rating;
  return rating + (AGE_BASELINE - Math.min(MAX_AGE, Math.max(MIN_AGE, age))) * POINTS_PER_YEAR;
}
