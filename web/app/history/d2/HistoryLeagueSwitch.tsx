import { Link, useLocation } from 'react-router-dom';

export function HistoryLeagueSwitch() {
  const { pathname } = useLocation();
  const league = pathname.startsWith('/history/fbawc') ? 'wc' : pathname.startsWith('/history/fbad2') ? 'd2' : 'fba';
  const chip = (id: string, to: string, label: string) => (
    <li><Link aria-current={league === id ? 'page' : undefined} className={league === id ? 'chip active' : 'chip'} to={to}>{label}</Link></li>
  );
  return (
    <nav aria-label="History league">
      <ul className="chips">
        {chip('fba', '/history', 'FBA')}
        {chip('d2', '/history/fbad2', 'D2')}
        {chip('wc', '/history/fbawc', 'World Cup')}
      </ul>
    </nav>
  );
}
