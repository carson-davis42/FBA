import { Link } from 'react-router-dom';
import { championshipRows } from '../../engine/history/views';
import type { PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import '../pages/season.css';

export function ChampionshipsPage() {
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data) return <p className="muted">Loading…</p>;
  const rows = championshipRows(seasons);
  return (
    <section>
      <h1>FBA Championships</h1>
      <SkippedWarning errors={errors} />
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr><th>Season</th><th>Champion</th><th>Runner-up</th><th>Score</th><th>Finals MVP</th><th>West</th><th>East</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.season}>
                <td><Link to={`/history/fba/season/${r.season}`}>S{r.season}</Link></td>
                <td>{r.champion}</td>
                <td>{r.runnerUp ?? '—'}</td>
                <td>{r.score}</td>
                <td><PlayerLink id={r.finalsMvp} players={players.data!} /></td>
                <td>{r.west ?? '—'}</td>
                <td>{r.east ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
