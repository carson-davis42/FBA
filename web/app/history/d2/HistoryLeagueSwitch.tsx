import { Link, useLocation } from 'react-router-dom';

export function HistoryLeagueSwitch() {
  const { pathname } = useLocation();
  const onD2 = pathname.startsWith('/history/fbad2');
  return (
    <nav aria-label="History league">
      <ul className="chips">
        <li><Link className={onD2 ? 'chip' : 'chip active'} to="/history">FBA</Link></li>
        <li><Link className={onD2 ? 'chip active' : 'chip'} to="/history/fbad2">D2</Link></li>
      </ul>
    </nav>
  );
}
