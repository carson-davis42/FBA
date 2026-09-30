import { Link } from 'react-router-dom';
import { championshipRows } from '../../engine/history/views';
import type { PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import { TeamFull, useFbaTeams } from './useTeams';
import './history.css';

export function ChampionshipsPage() {
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams, franchises } = useFbaTeams();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled) return <p className="muted">Loading…</p>;
  const rows = championshipRows(seasons);
  const champion = (season: number) => seasons.find(s => s.season === season)?.champions.find(c => c.title === 'FBA Champion');
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="FBA Championships" />
      <SkippedWarning errors={errors} />
      <ol className="timeline">
        {rows.map(r => {
          const c = champion(r.season);
          return (
            <li key={r.season} className="timeline-row">
              <Link className="timeline-season" to={`/history/fba/season/${r.season}`}>S{r.season}</Link>
              <div className="timeline-body">
                <div className="timeline-champ"><TeamFull teams={teams} franchises={franchises} teamId={c?.teamId} name={r.champion} season={r.season} /></div>
                <div className="muted">
                  {r.score} over {r.runnerUp ? <TeamFull teams={teams} franchises={franchises} teamId={c?.runnerUpId} name={r.runnerUp} season={r.season} /> : '—'}
                </div>
                {(r.west || r.east) && <div className="muted">West: {r.west ?? '—'} · East: {r.east ?? '—'}</div>}
              </div>
              {r.finalsMvp && <Badge kind="finals-mvp">Finals MVP <PlayerLink id={r.finalsMvp} players={players.data!} /></Badge>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
