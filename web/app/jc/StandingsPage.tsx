import { useState } from 'react';
import { jcClinch } from '../../engine/jc/clinch';
import { teamRating } from '../../engine/jc/rankings';
import { jcStandings } from '../../engine/jc/standings';
import type { CalendarFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { ClinchLegend, RankCell } from '../components/Clinch';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { jcGate } from './JcGate';
import { useJcDocs } from './useJcDocs';
import './jc.css';

const ALL = 'all';

export function StandingsPage() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const [picked, setPicked] = useState<string | null>(null);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Standings" /></section>;
  const gate = jcGate(docs, kicker, 'Standings');
  if (gate) return <>{gate}</>;
  const state = docs.state!;
  const title = state.schedule ? `S${season} FBAJC` : 'Standings';

  const teams = state.teams.teams;
  const byId = new Map<string, Team>(teams.map(t => [t.teamId, t]));
  const teamCell = (id: string) => {
    const t = byId.get(id);
    return t ? <TeamName team={t} season={season} to={`/league/fbajc/team/${id}`} /> : <span>{id}</span>;
  };
  const conferences: string[] = [];
  for (const t of teams) if (t.group != null && !conferences.includes(t.group)) conferences.push(t.group);
  const current = picked !== null && (picked === ALL || conferences.includes(picked)) ? picked : conferences[0] ?? ALL;
  const picker = (
    <label className="jc-conf-pick">Conference
      <select value={current} onChange={e => setPicked(e.target.value)}>
        {conferences.map(c => <option key={c} value={c}>{c}</option>)}
        <option value={ALL}>All conferences</option>
      </select>
    </label>
  );

  const games = state.results?.games ?? [];
  if (!state.schedule || games.length === 0) {
    const shown = current === ALL ? conferences : [current];
    return (
      <section className="jc-page">
        <PageHeader kicker={kicker} title={title} />
        {picker}
        <p className="muted">No games yet</p>
        {shown.map(conf => (
          <section key={conf} className="card">
            <h2>{conf}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Team</th></tr></thead>
                <tbody>
                  {teams.filter(t => t.group === conf).sort((a, b) => a.name.localeCompare(b.name)).map(t => <tr key={t.teamId}><td>{teamCell(t.teamId)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </section>
    );
  }

  const snaps = state.rankings?.snapshots ?? [];
  const ranking = snaps.length > 0 ? snaps[snaps.length - 1].order : null;
  const tables = jcStandings({ teams: state.teams, games, ranking, drawKeys: state.schedule.drawKeys });
  const shown = current === ALL ? tables : tables.filter(t => t.conference === current);

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={title} />
      {picker}
      {shown.map(({ conference, rows, ties }) => {
        const clinch = jcClinch(rows);
        const top = Math.max(...rows.map(r => r.confW));
        const kinds = rows.map(r => clinch[r.teamId]);
        return (
          <section key={conference} className="card">
            <h2>{conference}</h2>
            <div className="table-wrap">
              <table className="standings">
                <thead><tr><th>#</th><th>RK</th><th>Team</th><th>W-L</th><th>Conf</th><th>Pct</th><th>GB</th><th>Rating</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const gp = r.w + r.l;
                    const gb = ((top - r.confW) + (r.confL - Math.min(...rows.map(o => o.confL)))) / 2;
                    return (
                      <tr key={r.teamId}>
                        <RankCell kind={clinch[r.teamId]} league="fbajc">{i + 1}</RankCell>
                        <td>{r.rank ?? '–'}</td>
                        <td>{teamCell(r.teamId)}</td>
                        <td>{r.w}-{r.l}</td>
                        <td>{r.confW}-{r.confL}</td>
                        <td>{gp === 0 ? '–' : (r.w / gp).toFixed(3)}</td>
                        <td>{gb === 0 ? '–' : gb}</td>
                        <td>{teamRating(state.rosters.teams[r.teamId] ?? []).toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ClinchLegend kinds={kinds} league="fbajc" />
            {ties.length > 0 && <ul className="jc-ties">{ties.map(t => <li key={t}>{t}</li>)}</ul>}
          </section>
        );
      })}
    </section>
  );
}
