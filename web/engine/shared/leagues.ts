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

export function groupLabel(league: LeagueId, code: string | null): string {
  if (code === null) return 'Teams';
  return GROUP_LABEL[league][code] ?? code;
}
