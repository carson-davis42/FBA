import { Link } from 'react-router-dom';
import { titlesByCountry, wcTitleRows } from '../../../engine/history/wc';
import type { PlayersFile, WcHostsFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { PlayerLink, SkippedWarning } from '../PlayerLink';
import '../history.css';
import { useWcTeams, WcTeam } from './useWc';

export function WcHistoryPage() {
  const { seasons, errors, error } = useHistory('fbawc');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useWcTeams();
  const hostsDoc = useDoc<WcHostsFile>('leagues/fbawc/hosts.json');
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  const hostsSettled = !!hostsDoc.data || hostsDoc.missing || !!hostsDoc.error;
  if (!seasons || !players.data || !settled || !hostsSettled) return <p className="muted">Loading…</p>;
  const hosts = hostsDoc.data?.hosts ?? [];
  const rows = wcTitleRows(seasons);
  const played = new Set(rows.map(r => r.season));
  const upcoming = hosts.filter(h => !played.has(h.season)).sort((a, b) => a.season - b.season);
  const hostText = (season: number, fallback: string | null) => {
    const h = hosts.find(x => x.season === season);
    return h ? `${h.city}, ${h.country}` : fallback ?? '—';
  };
  const titles = titlesByCountry(rows);
  return (
    <section className="stack">
      <PageHeader kicker="World Cup" title="World Cup History" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Season</th><th>Host</th><th>Champion</th><th>Runner-up</th><th>Tournament MVP</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.season}>
                <td><Link to={`/history/fbawc/season/${r.season}`}>S{r.season}</Link></td>
                <td>{hostText(r.season, r.host)}</td>
                <td><WcTeam teams={teams} teamId={r.championId} name={r.champion} season={r.season} /></td>
                <td>{r.runnerUp ? <WcTeam teams={teams} teamId={r.runnerUpId} name={r.runnerUp} season={r.season} /> : '—'}</td>
                <td>{r.mvp ? <Badge kind="finals-mvp"><PlayerLink id={r.mvp} players={players.data!} /></Badge> : r.mvpName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {upcoming.length > 0 && (
        <div>
          <h2>Upcoming</h2>
          <ul className="chips">
            {upcoming.map(h => <li key={h.season} className="chip">S{h.season} · {h.city}, {h.country}</li>)}
          </ul>
        </div>
      )}
      <div>
        <h2>Titles</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Country</th><th>Titles</th><th>Seasons</th></tr></thead>
            <tbody>
              {titles.map(t => (
                <tr key={t.country}>
                  <td><WcTeam teams={teams} teamId={t.teamId} name={t.country} season={t.seasons[t.seasons.length - 1]} /></td>
                  <td>{t.titles}</td>
                  <td>{t.seasons.map(n => `S${n}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
