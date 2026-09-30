import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LEAGUES } from '../../engine/shared/leagues';
import type { LeagueId } from '../../engine/shared/types';

const KEY = 'fba-last-league';

export const SHORT_LABEL: Record<LeagueId, string> = { fba: 'FBA', fbad2: 'D2', fbajc: 'JC', fbawc: 'WC' };

export function leagueFromPath(pathname: string): LeagueId | null {
  if (pathname.startsWith('/history')) return 'fba';
  const m = /^\/(?:league|trade)\/([^/]+)/.exec(pathname);
  return m && (LEAGUES as string[]).includes(m[1]) ? (m[1] as LeagueId) : null;
}

function stored(): LeagueId | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && (LEAGUES as string[]).includes(v) ? (v as LeagueId) : null;
  } catch { return null; }
}

/** The league in the URL, else the last league visited (a per-viewer convenience), else the FBA. */
export function useCurrentLeague(): LeagueId {
  const { pathname } = useLocation();
  const fromPath = leagueFromPath(pathname);
  useEffect(() => {
    if (fromPath) { try { localStorage.setItem(KEY, fromPath); } catch { /* storage unavailable */ } }
  }, [fromPath]);
  return fromPath ?? stored() ?? 'fba';
}
