const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Parts { y: number; m: number; d: number }

/** Parses `YYYY-MM-DD` or a full ISO datetime into its UTC calendar day; null for anything else. */
function parts(iso: string | null | undefined): Parts | null {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

const dayLabel = (p: Parts, withYear: boolean) => `${MONTHS[p.m]} ${p.d}${withYear ? `, ${p.y}` : ''}`;

/** "Oct 12, 2026" (UTC, en-US); null for null or an invalid date. */
export function formatDay(iso: string | null | undefined): string | null {
  const p = parts(iso);
  return p ? dayLabel(p, true) : null;
}

/** "Oct 1 – Oct 12, 2026" within a year, "Dec 20, 2026 – Jan 4, 2027" across years; one date when both ends are the same day; null when either end is missing or invalid. */
export function formatSpan(openedIso: string | null | undefined, lockedIso: string | null | undefined): string | null {
  const a = parts(openedIso);
  const b = parts(lockedIso);
  if (!a || !b) return null;
  if (a.y === b.y && a.m === b.m && a.d === b.d) return dayLabel(b, true);
  if (a.y === b.y) return `${dayLabel(a, false)} – ${dayLabel(b, true)}`;
  return `${dayLabel(a, true)} – ${dayLabel(b, true)}`;
}
