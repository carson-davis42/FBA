import { NavLink } from 'react-router-dom';
import { LEAGUES, LEAGUE_LABEL } from '../../engine/shared/leagues';

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="section">Leagues</div>
      {LEAGUES.map(lg => (
        <NavLink key={lg} to={`/league/${lg}`}>{LEAGUE_LABEL[lg]}</NavLink>
      ))}
      <div className="section">Season</div>
      <NavLink to="/calendar">Calendar</NavLink>
      <NavLink to="/offseason">Offseason tools</NavLink>
      <div className="section">Archive</div>
      <NavLink to="/history">History</NavLink>
      <NavLink to="/history/fba/hall-of-fame">Hall of Fame</NavLink>
    </nav>
  );
}
