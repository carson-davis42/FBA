import { Link } from 'react-router-dom';
import { trophyCase } from '../../engine/history/trophies';
import { EXPANSION_TEAMS } from '../../engine/shared/expansion';
import type { MetaFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useFbaTeams } from './useTeams';
import './history.css';

const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

export function TeamsHistoryPage() {
  const { seasons, error } = useHistory('fba');
  const { settled, teams, franchises } = useFbaTeams();
  const meta = useDoc<MetaFile>('meta.json');
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons || !settled || (!meta.data && !meta.missing && !meta.error)) return <p className="muted">Loading…</p>;
  const played = seasons.length > 0 ? seasons.reduce((m, s) => Math.max(m, s.season), 0) : 79;
  // Logos are the ones in use this season (the last played season when the meta doc is unreadable).
  const season = meta.data?.currentSeason ?? played;
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
            // An expansion team not yet added to teams.json still shows, with the logo it debuts with.
            const team = teams.find(t => t.teamId === f.teamId) ?? EXPANSION_TEAMS.find(t => t.teamId === f.teamId);
            const c = trophyCase(f.teamId, { summaries: seasons, teams, franchises, hallOfFame: null });
            return (
              <Link key={f.teamId} className="card link" to={`/history/fba/teams/${f.teamId}`}>
                {team ? <TeamName team={team} season={season} size={40} /> : <b>{f.eras[0].name}</b>}
                <span className="muted">{count(c.championships.length, 'title', 'titles')} · {count(c.finals.length, 'Finals appearance', 'Finals appearances')} · {count(c.confTitles.length, 'conference title', 'conference titles')}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
