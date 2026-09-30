import { Link } from 'react-router-dom';
import { trophyCase } from '../../engine/history/trophies';
import { useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useFbaTeams } from './useTeams';
import './history.css';

export function TeamsHistoryPage() {
  const { seasons, error } = useHistory('fba');
  const { settled, teams, franchises } = useFbaTeams();
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons || !settled) return <p className="muted">Loading…</p>;
  const latest = seasons.length > 0 ? seasons.reduce((m, s) => Math.max(m, s.season), 0) : 79;
  const list = franchises?.franchises ?? [];
  const order = (id: string) => { const i = teams.findIndex(t => t.teamId === id); return i < 0 ? Infinity : i; };
  const sorted = [...list].sort((a, b) => {
    const d = order(a.teamId) - order(b.teamId);
    return d === 0 || Number.isNaN(d) ? a.teamId.localeCompare(b.teamId) : d;
  });
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="Teams" />
      {sorted.length === 0 ? <p className="muted">No franchise history yet. Run npm run import -- --franchises.</p> : (
        <div className="card-grid">
          {sorted.map(f => {
            const team = teams.find(t => t.teamId === f.teamId);
            const c = trophyCase(f.teamId, { summaries: seasons, teams, franchises, hallOfFame: null });
            return (
              <Link key={f.teamId} className="card link" to={`/history/fba/teams/${f.teamId}`}>
                {team ? <TeamName team={team} season={latest} size={40} /> : <b>{f.eras[0].name}</b>}
                <span className="muted">{c.championships.length} titles · {c.finals.length} Finals · {c.confTitles.length} conference titles</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
