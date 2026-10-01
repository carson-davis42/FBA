import { useState } from 'react';
import { dropped, rankChanges, teamRating } from '../../engine/jc/rankings';
import type { CalendarFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useJcDocs } from './useJcDocs';
import './jc.css';

export function RankingsPage() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Rankings" /></section>;
  const title = `S${season} FBAJC`;
  if (docs.error) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="error">{docs.error}</p></section>;
  const state = docs.state;
  if (!state) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="muted">Loading...</p></section>;

  const snaps = state.rankings?.snapshots ?? [];
  if (snaps.length === 0) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="muted">No rankings yet</p></section>;

  const idx = pickedDay !== null && snaps.some(s => s.afterDay === pickedDay) ? snaps.findIndex(s => s.afterDay === pickedDay) : snaps.length - 1;
  const snap = snaps[idx];
  const prev = idx > 0 ? snaps[idx - 1].order : null;
  const teams = state.teams.teams;
  const byId = new Map<string, Team>(teams.map(t => [t.teamId, t]));

  const record = new Map<string, [number, number]>();
  for (const g of state.results?.games ?? []) {
    if (g.homePts === g.awayPts) continue;
    const [w, l] = g.homePts > g.awayPts ? [g.home, g.away] : [g.away, g.home];
    const rw = record.get(w) ?? [0, 0]; rw[0]++; record.set(w, rw);
    const rl = record.get(l) ?? [0, 0]; rl[1]++; record.set(l, rl);
  }

  // rankChanges marks every team NR when there is no previous poll; the first poll shows '--' instead.
  const changes = new Map(rankChanges(prev, snap.order).map(c => [c.teamId, c.change]));
  const changeOf = (teamId: string, rank: number): string => (rank > 25 ? '' : prev ? changes.get(teamId) ?? '' : '--');
  const out = dropped(prev, snap.order);
  const order = all ? snap.order : snap.order.slice(0, 25);
  const label = (afterDay: number) => (afterDay === 0 ? 'Preseason' : `After day ${afterDay}`);

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={title} />
      <div className="jc-actions">
        <label className="jc-conf-pick">Snapshot
          <select value={snap.afterDay} onChange={e => setPickedDay(Number(e.target.value))}>
            {snaps.map(s => <option key={s.afterDay} value={s.afterDay}>{label(s.afterDay)}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Show all 216</label>
      </div>
      <section className="card">
        <h2>{all ? 'Full rankings' : 'Top 25'}</h2>
        <div className="table-wrap">
          <table className="standings">
            <thead><tr><th>#</th><th>Chg</th><th>Team</th><th>Conf</th><th>W-L</th><th>Rating</th></tr></thead>
            <tbody>
              {order.map((id, i) => {
                const t = byId.get(id);
                const rec = record.get(id) ?? [0, 0];
                return (
                  <tr key={id}>
                    <td>{i + 1}</td>
                    <td className="rk-change">{changeOf(id, i + 1)}</td>
                    <td>{t ? <TeamName team={t} season={season} to={`/league/fbajc/team/${id}`} /> : id}</td>
                    <td>{t?.group ?? ''}</td>
                    <td>{rec[0]}-{rec[1]}</td>
                    <td>{teamRating(state.rosters.teams[id] ?? []).toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {out.length > 0 && <p className="muted">Dropped out: {out.map(id => byId.get(id)?.name ?? id).join(', ')}</p>}
      </section>
    </section>
  );
}
