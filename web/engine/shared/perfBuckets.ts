export interface PerfRow { id: string; x: number; y: number }

/**
 * Least-squares fit y ≈ a + b·x over the rows, then each row's residual z-score bucketed:
 * z ≥ 1.5 → +2, ≥ 0.5 → +1, ≤ −1.5 → −2, ≤ −0.5 → −1, else 0. Fewer than 3 rows → empty.
 */
export function zBuckets(rows: PerfRow[]): Map<string, number> {
  const out = new Map<string, number>();
  if (rows.length < 3) return out;
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.x, 0) / n;
  const my = rows.reduce((s, r) => s + r.y, 0) / n;
  const sxx = rows.reduce((s, r) => s + (r.x - mx) ** 2, 0);
  const sxy = rows.reduce((s, r) => s + (r.x - mx) * (r.y - my), 0);
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const resid = rows.map(r => r.y - (a + b * r.x));
  const sd = Math.sqrt(resid.reduce((s, x) => s + x * x, 0) / n);
  rows.forEach((r, i) => {
    const z = sd < 1e-9 ? 0 : resid[i] / sd;
    out.set(r.id, z >= 1.5 ? 2 : z >= 0.5 ? 1 : z <= -1.5 ? -2 : z <= -0.5 ? -1 : 0);
  });
  return out;
}
