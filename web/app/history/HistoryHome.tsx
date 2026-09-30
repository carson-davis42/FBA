import { Link } from 'react-router-dom';
import { useHistory } from '../api';
import { SkippedWarning } from './PlayerLink';

export function HistoryHome() {
  const { seasons, errors, error } = useHistory('fba');
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons) return <p className="muted">Loading…</p>;
  const latest = seasons.reduce((m, s) => Math.max(m, s.season), 0);
  return (
    <section>
      <h1>History</h1>
      <SkippedWarning errors={errors} />
      <ul>
        <li><Link to="/history/fba/championships">Championships</Link></li>
        <li><Link to="/history/fba/awards">Awards</Link></li>
        {latest > 0 && <li><Link to={`/history/fba/season/${latest}`}>Seasons</Link></li>}
        <li><Link to="/history/fba/players">Players</Link></li>
      </ul>
    </section>
  );
}
