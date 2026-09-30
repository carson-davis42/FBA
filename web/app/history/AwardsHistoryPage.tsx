import { Link } from 'react-router-dom';
import { AWARD_LABEL } from '../../engine/awards/races';
import { awardRows, type FbaAwardKey } from '../../engine/history/views';
import type { PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import { TeamAbbr, useFbaTeams } from './useTeams';
import './history.css';

const KEYS: FbaAwardKey[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];

export function AwardsHistoryPage() {
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useFbaTeams();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled) return <p className="muted">Loading…</p>;
  const rows = awardRows(seasons);
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="FBA Awards" actions={<Link className="btn" to="/history/fba/awards/players">Awards by player</Link>} />
      <SkippedWarning errors={errors} />
      <div className="card-grid">
        {KEYS.map(k => {
          const winners = rows.flatMap(r => { const w = r.winners[k]; return w ? [{ season: r.season, w }] : []; });
          return (
            <section key={k} className="card headed">
              <div className="card-head"><h2>{AWARD_LABEL[k]}</h2></div>
              {winners.length === 0 ? <p className="muted">No winners recorded</p> : (
                <ul className="winner-list">
                  {winners.map(({ season, w }) => (
                    <li key={season}>
                      <Link className="chip" to={`/history/fba/season/${season}`}>S{season}</Link>
                      <PlayerLink id={w.playerId} players={players.data!} />
                      {w.teamId !== '?' && <TeamAbbr teams={teams} teamId={w.teamId} season={season} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
