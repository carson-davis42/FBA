import { NavLink } from 'react-router-dom';

/** Scores · Standings · Playoffs · Awards · Teams · Transactions for the FBA and D2; other leagues only have Teams for now. */
export function LeagueTabs({ league }: { league: string }) {
  const tabs: [string, string][] = league === 'fba' || league === 'fbad2'
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['', 'Teams'], ['transactions', 'Transactions']]
    : [['', 'Teams']];
  return (
    <nav className="league-tabs" aria-label="League sections">
      {tabs.map(([path, label]) => (
        <NavLink key={label} end to={path ? `/league/${league}/${path}` : `/league/${league}`}>{label}</NavLink>
      ))}
    </nav>
  );
}
