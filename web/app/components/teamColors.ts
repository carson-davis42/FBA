import type { CSSProperties } from 'react';
import { inkFor } from '../../engine/shared/ink';
import type { LeagueId, Team } from '../../engine/shared/types';

export interface TeamTheme { primary: string; secondary: string; ink: string }

/** FBA team colours, hand-picked from each team's current logo (presentation only; edit freely). */
export const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  ATL: { primary: '#B01818', secondary: '#111111' },
  BOS: { primary: '#1A1A1A', secondary: '#C8C8C8' },
  CAR: { primary: '#16204A', secondary: '#D4AF37' },
  CHI: { primary: '#173552', secondary: '#6FB2D8' },
  CIN: { primary: '#16207A', secondary: '#F07A1A' },
  CP: { primary: '#3A1638', secondary: '#8E4A6E' },
  CGG: { primary: '#1E4D2B', secondary: '#5A9A72' },
  DCB: { primary: '#E01818', secondary: '#111111' },
  DEN: { primary: '#3A1A12', secondary: '#B07232' },
  DET: { primary: '#16203E', secondary: '#F04A30' },
  FLO: { primary: '#10162E', secondary: '#4FCFCF' },
  HON: { primary: '#127272', secondary: '#F09434' },
  LA: { primary: '#111111', secondary: '#F2B516' },
  LAL: { primary: '#0B4DC8', secondary: '#0A1A52' },
  MW: { primary: '#173C74', secondary: '#6FB2F0' },
  MAN: { primary: '#4F2F92', secondary: '#D2743A' },
  MEM: { primary: '#173A58', secondary: '#4FB2F0' },
  MIL: { primary: '#123A38', secondary: '#F2B430' },
  MON: { primary: '#173552', secondary: '#1A92F0' },
  NO: { primary: '#121A3A', secondary: '#B8965A' },
  NY: { primary: '#2F6FD6', secondary: '#333333' },
  OAK: { primary: '#3F7F3F', secondary: '#F2B416' },
  OV: { primary: '#7A1A34', secondary: '#8FB0D0' },
  PHI: { primary: '#0F2C78', secondary: '#E4102B' },
  PHX: { primary: '#6A2FA8', secondary: '#F07A1A' },
  SAS: { primary: '#111111', secondary: '#B07232' },
  SEA: { primary: '#127A16', secondary: '#111111' },
  STL: { primary: '#D81834', secondary: '#141A3A' },
  TEX: { primary: '#8E1616', secondary: '#EFEFD0' },
  TOR: { primary: '#F07A16', secondary: '#111111' },
  VAN: { primary: '#125494', secondary: '#1A92D6' },
  VEG: { primary: '#E0661A', secondary: '#111111' },
};

export { inkFor };

/**
 * A new logo comes with new colours: from this season on, the team wears this pair (the logo era's start season, as in the logo manifest).
 * Before the first entry the pair in TEAM_COLORS applies. A test fails when the manifest has a logo from S80 on that has no entry here.
 */
export const COLOR_ERAS: Record<string, { from: number; primary: string; secondary: string }[]> = {
  OAK: [{ from: 80, primary: '#0B7A3E', secondary: '#F5B800' }],
  DEN: [{ from: 80, primary: '#2A1610', secondary: '#E09A1F' }],
};

let currentSeason = 79;

/** The season colours default to; the shell sets it from the calendar's season so every page flips with the logo. */
export function setCurrentSeason(season: number): void {
  currentSeason = season;
}

/** The pair a team wears in a season: the latest era entry that has started, else the base pair. */
export function colorsFor(teamId: string, season: number): { primary: string; secondary: string } | undefined {
  const era = (COLOR_ERAS[teamId] ?? []).filter(e => e.from <= season).sort((a, b) => b.from - a.from)[0];
  return era ?? TEAM_COLORS[teamId];
}

/** `season` is the season the page shows (a past champion, a box score); without it, the current season. */
export function teamTheme(team: Team, league: LeagueId, season: number = currentSeason): TeamTheme {
  const hit = league === 'fba' ? colorsFor(team.teamId, season) : undefined;
  if (!hit) return { primary: team.badge.bg, secondary: team.badge.accent ?? team.badge.bg, ink: team.badge.fg };
  return { primary: hit.primary, secondary: hit.secondary, ink: inkFor(hit.primary) };
}

const lum = (hex: string): number => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const NEAR_WHITE = 0.85;

/** The colour a white scorebug tints with: the primary, or the secondary when the primary is near white (many schools' badge background is). */
export function lightAccent(theme: TeamTheme): string {
  return lum(theme.primary) > NEAR_WHITE && lum(theme.secondary) <= NEAR_WHITE ? theme.secondary : theme.primary;
}

export function teamVars(theme: TeamTheme): CSSProperties {
  return { '--team': theme.primary, '--team-2': theme.secondary, '--team-ink': theme.ink } as CSSProperties;
}
