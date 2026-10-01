import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CalendarFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { PlayerLink } from '../history/PlayerLink';
import { useJcDocs } from './useJcDocs';
import './jc.css';

const NATIONAL = 'all';

interface Leader { playerId: string; teamId: string; pts: number; gp: number; ppg: number }

export function LeadersPage() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const [picked, setPicked] = useState<string>(NATIONAL);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Leaders" /></section>;
  const title = `S${season} FBAJC Leaders`;
  if (docs.error) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="error">{docs.error}</p></section>;
  const state = docs.state;
  if (!state) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="muted">Loading...</p></section>;

  const teams = state.teams.teams;
  const byId = new Map<string, Team>(teams.map(t => [t.teamId, t]));
  const conferences: string[] = [];
  for (const t of teams) if (t.group != null && !conferences.includes(t.group)) conferences.push(t.group);
  const current = picked === NATIONAL || conferences.includes(picked) ? picked : NATIONAL;

  const tally = new Map<string, Leader>();
  for (const g of state.results?.games ?? []) {
    for (const [teamId, lines] of [[g.home, g.box?.home ?? []], [g.away, g.box?.away ?? []]] as const) {
      for (const l of lines) {
        const cur = tally.get(l.playerId) ?? { playerId: l.playerId, teamId, pts: 0, gp: 0, ppg: 0 };
        cur.pts += l.pts;
        cur.gp += 1;
        cur.teamId = teamId;
        tally.set(l.playerId, cur);
      }
    }
  }
  const all = [...tally.values()].filter(l => l.gp >= 1).map(l => ({ ...l, ppg: l.pts / l.gp }));
  const shown = (current === NATIONAL ? all : all.filter(l => byId.get(l.teamId)?.group === current))
    .sort((a, b) => b.ppg - a.ppg || b.pts - a.pts || a.playerId.localeCompare(b.playerId))
    .slice(0, current === NATIONAL ? 20 : 15);

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={title} />
      <label className="jc-conf-pick">View
        <select value={current} onChange={e => setPicked(e.target.value)}>
          <option value={NATIONAL}>National top 20</option>
          {conferences.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {shown.length === 0 ? <p className="muted">No games yet</p> : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th>PPG</th><th>Rating</th></tr></thead>
              <tbody>
                {shown.map((l, i) => {
                  const team = byId.get(l.teamId);
                  const entry = state.rosters.teams[l.teamId]?.find(r => r.playerId === l.playerId);
                  const named = !!state.players.players[l.playerId]?.name;
                  return (
                    <tr key={l.playerId}>
                      <td>{i + 1}</td>
                      <td>{named ? <PlayerLink id={l.playerId} players={state.players} /> : `X (${team?.abbr ?? l.teamId})`}</td>
                      <td>{team ? <TeamName team={team} season={season} variant="abbr" to={`/league/fbajc/team/${l.teamId}`} /> : <Link to={`/league/fbajc/team/${l.teamId}`}>{l.teamId}</Link>}</td>
                      <td>{entry?.position ?? '–'}</td>
                      <td>{l.ppg.toFixed(1)}</td>
                      <td>{entry?.rating ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
