import type { LeagueId } from './types';

export const LEAGUES: LeagueId[] = ['fba', 'fbad2', 'fbajc', 'fbawc'];

export const LEAGUE_LABEL: Record<LeagueId, string> = {
  fba: 'FBA',
  fbad2: 'FBAD2',
  fbajc: 'FBAJC',
  fbawc: 'World Cup',
};

const GROUP_LABEL: Record<LeagueId, Record<string, string>> = {
  fba: { E: 'Eastern Conference', W: 'Western Conference' },
  fbad2: { PL: 'Premier League', WL: 'World League', UL: 'United League', IL: 'International League', D2: 'D2 International', AM: 'D2-America', EW: 'Euro-West', EE: 'Euro-East', ES: 'Euro-South' },
  fbajc: {
    B12: 'Big 12', ACC: 'ACC', BE: 'Big East', SEC: 'SEC', B10: 'Big Ten', AAC: 'American',
    P12: 'PAC-12', A10: 'Atlantic 10', PAT: 'Patriot', COL: 'Colonial', HOR: 'Horizon', IVY: 'Ivy',
    SOCON: 'Southern', SUN: 'Sun Belt', SKY: 'Big Sky', MWC: 'Mountain West', OVC: 'Ohio Valley', NEC: 'NEC',
  },
  fbawc: {},
};

export function isLeagueId(x: string): x is LeagueId {
  return (LEAGUES as string[]).includes(x);
}

/** The order a league's groups are listed in on the teams page; a league without one keeps the order its teams file gives. */
const GROUP_ORDER: Partial<Record<LeagueId, string[]>> = { fbad2: ['PL', 'WL', 'UL', 'IL'] };

/** `groups` in the league's listing order (groups it doesn't name go last, in the order given). */
export function orderGroups<T extends string | null>(league: LeagueId, groups: T[]): T[] {
  const order = GROUP_ORDER[league];
  if (!order) return groups;
  const rank = (g: T) => { const i = order.indexOf(g as string); return i === -1 ? order.length : i; };
  return groups.map((g, k) => ({ g, k })).sort((a, b) => rank(a.g) - rank(b.g) || a.k - b.k).map(x => x.g);
}

export function groupLabel(league: LeagueId, code: string | null): string {
  if (code === null) return 'Teams';
  return GROUP_LABEL[league][code] ?? code;
}
