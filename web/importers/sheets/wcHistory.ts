import type { Report } from '../report';
export interface WcRow { season: number; city: string; country: string; champion: string | null; runnerUp: string | null; mvp: string | null }

const cell = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' || t.toUpperCase() === 'X' ? null : t;
};

/** The "D2 World Cups" tab: Year | Host City | Host Country | Champions | Runner-Up | Tournament MVP | Date. Upcoming seasons have only the host. */
export function parseWorldCups(rows: string[][], report?: Report): WcRow[] {
  const out: WcRow[] = [];
  for (const r of rows) {
    const m = /^S(\d+)$/.exec((r[0] ?? '').trim());
    if (!m) continue;
    const city = cell(r[1]);
    const country = cell(r[2]);
    if (city === null || country === null) {
      report?.warn('wc-history', `Skipped S${m[1]}: the host city or country is blank`);
      continue;
    }
    out.push({ season: Number(m[1]), city, country, champion: cell(r[3]), runnerUp: cell(r[4]), mvp: cell(r[5]) });
  }
  return out;
}
