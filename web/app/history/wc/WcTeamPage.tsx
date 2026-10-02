import { Link, useParams } from 'react-router-dom';
import { wcAppearances } from '../../../engine/history/wc';
import { useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { TeamName } from '../../components/TeamName';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { useWcTeams } from './useWc';

/** A national team's World Cup history: each World Cup it is known to have played and how far it went. */
export function WcTeamPage() {
  const { teamId = '' } = useParams();
  const { seasons, errors, error } = useHistory('fbawc');
  const { settled, teams } = useWcTeams();
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons || !settled) return <p className="muted">Loading…</p>;
  const team = teams.find(t => t.teamId === teamId);
  if (!team) return <section className="stack"><p className="muted">Not found</p><p><Link to="/history/fbawc">Back to World Cup history</Link></p></section>;
  const rows = wcAppearances(team, seasons);
  const titles = rows.filter(r => r.result === 'Champion');
  return (
    <section className="stack">
      <PageHeader kicker="World Cup" title={team.name} />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <p><TeamName team={team} season={rows[0]?.season ?? 1} size={40} /></p>
      <p className="muted">
        {rows.length === 0 ? 'No World Cups on record.' : `${rows.length} World Cup${rows.length === 1 ? '' : 's'} on record · ${titles.length} title${titles.length === 1 ? '' : 's'}${titles.length ? ` (${titles.map(t => `S${t.season}`).join(', ')})` : ''}`}
      </p>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="stat-table" aria-label="World Cups">
            <thead><tr><th>Season</th><th>Host</th><th>Result</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.season}>
                  <td><Link to={`/history/fbawc/season/${r.season}`}>S{r.season}</Link></td>
                  <td>{r.host ?? '—'}</td>
                  <td>{r.result ?? 'Played'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p><Link to="/history/fbawc">Back to World Cup history</Link></p>
    </section>
  );
}
