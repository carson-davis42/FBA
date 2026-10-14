import { useMemo } from 'react';
import type { Team, TeamsFile } from '../../engine/shared/types';
import { WC_POSITIONS, wcRankings } from '../../engine/wc/rankings';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useWcRosters } from './useWcRosters';
import './wc.css';

/** All World Cup countries ranked by country rating (the average of the five roster ratings), from the latest derived rosters. */
export function RankingsPage() {
  const wc = useWcRosters();
  const { data: teams, error } = useDoc<TeamsFile>('leagues/fbawc/teams.json');
  const rows = useMemo(() => (teams && wc.rosters ? wcRankings(teams.teams.map(t => t.teamId), wc.rosters.teams) : []), [teams, wc.rosters]);
  const head = <PageHeader kicker="World Cup" title="Rankings" />;
  if (error) return <section className="wc-page">{head}<p className="error">Couldn't load teams: {error.message}</p></section>;
  if (wc.settled && wc.rosters === null) return <section className="wc-page">{head}<p className="muted">No World Cup rosters yet. Start qualifying to generate them.</p></section>;
  if (!teams || !wc.rosters || wc.season === undefined) return <section className="wc-page">{head}<p className="muted">Loading…</p></section>;
  const byId = new Map<string, Team>(teams.teams.map(t => [t.teamId, t]));
  const season = wc.season;
  return (
    <section className="wc-page">
      {head}
      <p className="muted">S{season} rosters · {rows.length} countries · rating is the average of the five roster ratings</p>
      <section className="card">
        <div className="table-wrap">
          <table className="standings">
            <thead><tr><th>#</th><th>Team</th><th>Rating</th>{WC_POSITIONS.map(p => <th key={p}>{p}</th>)}<th>Generated</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const t = byId.get(r.teamId);
                return (
                  <tr key={r.teamId}>
                    <td>{r.rank}</td>
                    <td>{t ? <TeamName team={t} season={season} to={`/league/fbawc/team/${r.teamId}`} /> : r.teamId}</td>
                    <td>{r.rating.toFixed(1)}</td>
                    {r.slots.map((v, i) => <td key={WC_POSITIONS[i]}>{v ?? '—'}</td>)}
                    <td>{r.generated > 0 ? r.generated : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
