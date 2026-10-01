import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { LeagueId } from '../../engine/shared/types';

export function leagueSections(league: LeagueId): [string, string][] {
  return league === 'fba' || league === 'fbad2'
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['rankings', 'Rankings'], ['', 'Teams'], ['transactions', 'Transactions']]
    : league === 'fbajc'
      ? [['scores', 'Scores'], ['standings', 'Standings'], ['rankings', 'Rankings'], ['tournaments', 'Tournaments'], ['postseason', 'Postseason'], ['awards', 'Awards'], ['leaders', 'Leaders'], ['', 'Teams'], ['recruiting', 'Recruiting'], ['portal', 'Portal']]
      : [['qualifying', 'Qualifying'], ['worldcup', 'World Cup'], ['', 'Teams']];
}

const HOF = '/history/fba/hall-of-fame';

/** Row 3 of the header: the current league's sections, then the global links. Sticky at the top. */
export function SectionNav({ league }: { league: LeagueId }) {
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('a.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  const historyActive = pathname.startsWith('/history') && !pathname.startsWith(HOF);
  const teamPage = pathname.startsWith(`/league/${league}/team/`) || pathname === `/league/${league}/free-agency`;
  return (
    <nav ref={nav} className="section-nav" aria-label="Site sections">
      {leagueSections(league).map(([path, label]) => (
        <NavLink key={label} end to={path ? `/league/${league}/${path}` : `/league/${league}`} className={label === 'Teams' && teamPage ? 'active' : undefined}>{label}</NavLink>
      ))}
      <span className="divider" aria-hidden="true" />
      <NavLink to="/calendar">Calendar</NavLink>
      <NavLink to="/offseason">Offseason</NavLink>
      <NavLink to="/history" className={historyActive ? 'active' : ''} end>History</NavLink>
      <NavLink to={HOF}>Hall of Fame</NavLink>
    </nav>
  );
}
