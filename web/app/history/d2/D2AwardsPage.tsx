import { Link } from 'react-router-dom';
import { AWARD_LABEL } from '../../../engine/awards/races';
import { d2Mvps, d2MvpCounts, rsChampionsOf } from '../../../engine/history/d2';
import { groupLabel } from '../../../engine/shared/leagues';
import type { PlayersFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { PlayerLink, SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';

export function D2AwardsPage() {
  const { seasons, errors, error } = useHistory('fbad2');
  const players = useDoc<PlayersFile>('players.json');
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data) return <p className="muted">Loading…</p>;
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  const top = d2MvpCounts(seasons).slice(0, 10);
  return (
    <section className="stack">
      <PageHeader kicker="FBAD2 history" title="D2 Awards" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <table className="stat-table">
        <thead><tr><th>Season</th><th>MVPs</th><th>Regular-season champions</th></tr></thead>
        <tbody>
          {ordered.map(s => (
            <tr key={s.season}>
              <td><Link to={`/history/fbad2/season/${s.season}`}>S{s.season}</Link></td>
              <td>
                {d2Mvps(s).map((a, i) => (
                  <span key={i}>{i > 0 && <br />}{AWARD_LABEL[a.award]}: <PlayerLink id={a.playerId} players={players.data!} /> ({a.teamId})</span>
                ))}
              </td>
              <td>
                {rsChampionsOf(s).map((rc, i) => (
                  <span key={i}>{i > 0 && <br />}{groupLabel('fbad2', rc.group)}: {rc.teams.join(' / ')}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <h2 className="section-title">Most MVPs</h2>
        <ol>
          {top.map(t => <li key={t.playerId}><PlayerLink id={t.playerId} players={players.data!} /> ×{t.count}</li>)}
        </ol>
      </div>
    </section>
  );
}
