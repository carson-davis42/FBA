import { Link } from 'react-router-dom';
import { d2TitleRows } from '../../../engine/history/d2';
import { formatScore } from '../../../engine/history/format';
import { groupLabel } from '../../../engine/shared/leagues';
import type { PlayersFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { PlayerLink, SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';
import { D2Team, useD2Teams } from './useD2';

export function D2ChampionshipsPage() {
  const { seasons, errors, error } = useHistory('fbad2');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useD2Teams();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled) return <p className="muted">Loading…</p>;
  const rows = d2TitleRows(seasons);
  const seasonNumbers = [...new Set(rows.map(r => r.season))];
  return (
    <section className="stack">
      <PageHeader kicker="FBAD2 history" title="D2 Championships" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <ol className="timeline">
        {seasonNumbers.map(n => (
          <li key={n} className="timeline-row">
            <Link className="timeline-season" to={`/history/fbad2/season/${n}`}>S{n}</Link>
            <div className="timeline-body">
              {rows.filter(r => r.season === n).map((r, i) => (
                <div key={i}>
                  <div className="timeline-champ">
                    <b>{r.group === 'D2' || r.group === null ? r.title : groupLabel('fbad2', r.group)}</b>{' '}
                    <D2Team teams={teams} teamId={r.teamId} name={r.champion} season={n} /> over{' '}
                    {r.runnerUp ? <D2Team teams={teams} teamId={r.runnerUpId} name={r.runnerUp} season={n} /> : '—'}
                  </div>
                  {(r.score || r.seriesMvp) && (
                    <div className="muted">
                      {r.score && formatScore(r.score)}
                      {r.seriesMvp && <> <Badge kind="finals-mvp">Series MVP <PlayerLink id={r.seriesMvp} players={players.data!} /></Badge></>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
