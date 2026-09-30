import { Link } from 'react-router-dom';
import { awardRows, type FbaAwardKey } from '../../engine/history/views';
import type { PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import '../pages/season.css';

const KEYS: FbaAwardKey[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];

export function AwardsHistoryPage() {
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data) return <p className="muted">Loading…</p>;
  const rows = awardRows(seasons);
  return (
    <section>
      <h1>FBA Awards</h1>
      <SkippedWarning errors={errors} />
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr><th>Season</th>{KEYS.map(k => <th key={k}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.season}>
                <td><Link to={`/history/fba/season/${r.season}`}>S{r.season}</Link></td>
                {KEYS.map(k => {
                  const w = r.winners[k];
                  if (!w) return <td key={k}>—</td>;
                  return (
                    <td key={k}>
                      <PlayerLink id={w.playerId} players={players.data!} />
                      {w.teamId !== '?' && ` (${w.teamId})`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
