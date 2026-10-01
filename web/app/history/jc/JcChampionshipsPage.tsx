import { Link } from 'react-router-dom';
import { jcSeasonLabel, jcTitleCounts, jcTitleRows } from '../../../engine/history/jc';
import { formatScore } from '../../../engine/history/format';
import type { Champion, PlayersFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { JcPerson, JcTeam, useJcTeams } from './useJc';

const seasonList = (list: number[]): string => list.map(n => `S${n}`).join(', ') || '—';

export function JcChampionshipsPage() {
  const { seasons, errors, error } = useHistory('fbajc');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useJcTeams();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled) return <p className="muted">Loading…</p>;
  const roster = players.data;
  const rows = jcTitleRows(seasons).filter(r => r.national || r.nit);
  const counts = jcTitleCounts(rows);
  const line = (c: Champion, season: number, label: string) => (
    <div>
      <div className="timeline-champ">
        <b>{label}</b> <JcTeam teams={teams} teamId={c.teamId} name={c.champion} season={season} /> over{' '}
        {c.runnerUp ? <JcTeam teams={teams} teamId={c.runnerUpId} name={c.runnerUp} season={season} /> : '—'}
      </div>
      {(c.score || c.finalsMvp || c.mvpName) && (
        <div className="muted">
          {c.score && formatScore(c.score)}
          {(c.finalsMvp || c.mvpName) && <> <Badge kind="finals-mvp">C-Ship MVP <JcPerson id={c.finalsMvp} name={c.mvpName} players={roster} /></Badge></>}
        </div>
      )}
    </div>
  );
  return (
    <section className="stack">
      <PageHeader kicker="FBAJC history" title="College Championships" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      {rows.length === 0 && <p className="muted">No championships recorded yet.</p>}
      <ol className="timeline">
        {rows.map(r => (
          <li key={r.season} className="timeline-row">
            <Link className="timeline-season" to={`/history/fbajc/season/${r.season}`}>{jcSeasonLabel(r.season)}</Link>
            <div className="timeline-body">
              {r.national && line(r.national, r.season, 'National Champion')}
              {r.nit && line(r.nit, r.season, 'NIT Champion')}
            </div>
          </li>
        ))}
      </ol>
      {counts.length > 0 && (
        <div>
          <h2 className="section-title">Titles by school</h2>
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>School</th><th className="n">National</th><th>Seasons</th><th className="n">Runner-up</th><th className="n">NIT</th></tr></thead>
              <tbody>
                {counts.map(c => (
                  <tr key={c.key}>
                    <td><JcTeam teams={teams} teamId={c.key} name={c.name} season={c.national[c.national.length - 1] ?? c.nit[c.nit.length - 1] ?? 0} /></td>
                    <td className="n">{c.national.length}</td>
                    <td>{seasonList(c.national)}</td>
                    <td className="n">{c.runnerUp.length}</td>
                    <td className="n">{c.nit.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
