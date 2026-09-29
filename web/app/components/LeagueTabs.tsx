import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/** Scores · Standings · Playoffs · Awards · Rankings · Teams · Transactions for the FBA and D2; other leagues only have Teams for now. */
export function LeagueTabs({ league }: { league: string }) {
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // At phone width the strip scrolls sideways; keep the current tab visible.
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('a.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  const tabs: [string, string][] = league === 'fba' || league === 'fbad2'
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['rankings', 'Rankings'], ['', 'Teams'], ['transactions', 'Transactions']]
    : [['', 'Teams']];
  return (
    <nav ref={nav} className="league-tabs" aria-label="League sections">
      {tabs.map(([path, label]) => (
        <NavLink key={label} end to={path ? `/league/${league}/${path}` : `/league/${league}`}>{label}</NavLink>
      ))}
    </nav>
  );
}
