import { useNavigate, useParams } from 'react-router-dom';
import { AWARD_LABEL } from '../../../engine/awards/races';
import { d2Mvps, d2TitleRows, rsChampionsOf } from '../../../engine/history/d2';
import { formatScore } from '../../../engine/history/format';
import { groupLabel } from '../../../engine/shared/leagues';
import type { PlayersFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { Hero } from '../../components/Hero';
import { Bracket } from '../../playoffs/Bracket';
import { PlayerLink, SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';
import { D2Team, useD2Teams } from './useD2';

const GROUPS = ['PL', 'WL', 'UL', 'IL'];

export function D2SeasonPage() {
  const { season: param = '' } = useParams();
  const navigate = useNavigate();
  const { seasons, errors, error } = useHistory('fbad2');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useD2Teams();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled) return <p className="muted">Loading…</p>;
  const n = /^\d+$/.test(param) ? Number(param) : NaN;
  const season = seasons.find(s => s.season === n);
  if (!season) return <p className="muted">Not found</p>;
  const roster = players.data;
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  const titles = d2TitleRows([season]);
  const rs = rsChampionsOf(season);
  const mvps = d2Mvps(season);
  const standings = season.standings;
  const teamMap = new Map(teams.map(t => [t.teamId, t]));
  const nameOf = (ref: string) => teams.find(t => t.teamId === ref)?.name ?? ref;
  return (
    <section className="stack">
      <Hero kicker={`Season ${n}`} title={`S${n} D2 season`} />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <label>
        Season{' '}
        <select aria-label="Season" value={n} onChange={e => navigate(`/history/fbad2/season/${e.target.value}`)}>
          {ordered.map(s => <option key={s.season} value={s.season}>S{s.season}</option>)}
        </select>
      </label>
      {titles.length > 0 && (
        <div>
          <h2 className="section-title">Titles</h2>
          <ul className="plain-list">
            {titles.map((r, i) => (
              <li key={i}>
                <b>{r.group === 'D2' || r.group === null ? r.title : groupLabel('fbad2', r.group)}</b>{' '}
                <D2Team teams={teams} teamId={r.teamId} name={r.champion} season={n} /> over{' '}
                {r.runnerUp ? <D2Team teams={teams} teamId={r.runnerUpId} name={r.runnerUp} season={n} /> : '—'}
                {r.score && <span className="muted"> {formatScore(r.score)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rs.length > 0 && (
        <div>
          <h2 className="section-title">Regular-season champions</h2>
          <ul className="plain-list">
            {rs.map((rc, i) => <li key={i}>{groupLabel('fbad2', rc.group)}: {rc.teams.join(', ')}</li>)}
          </ul>
        </div>
      )}
      {mvps.length > 0 && (
        <div>
          <h2 className="section-title">MVPs</h2>
          <ul className="plain-list">
            {mvps.map((a, i) => <li key={i}>{AWARD_LABEL[a.award]}: <PlayerLink id={a.playerId} players={roster} /> ({a.teamId})</li>)}
          </ul>
        </div>
      )}
      {standings && (
        <div className="stack">
          <h2 className="section-title">Standings</h2>
          {GROUPS.filter(g => standings.some(r => r.group === g)).map(g => (
            <div key={g}>
              <h3>{groupLabel('fbad2', g)}</h3>
              <div className="table-wrap">
                <table className="stat-table standings">
                  <thead><tr><th className="rank">Rank</th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">W%</th></tr></thead>
                  <tbody>
                    {standings.filter(r => r.group === g).sort((a, b) => a.rank - b.rank).map(r => (
                      <tr key={r.teamId}>
                        <td className="rank">{r.rank}</td>
                        <td><D2Team teams={teams} teamId={r.teamId} name={r.name} season={n} /></td>
                        <td className="n">{r.w}</td>
                        <td className="n">{r.l}</td>
                        <td className="n">{r.w + r.l === 0 ? '—' : (r.w / (r.w + r.l)).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      {season.bracket && (
        <div className="stack">
          <h2 className="section-title">Playoffs</h2>
          {GROUPS.filter(g => season.bracket!.series.some(s => s.group === g)).map(g => (
            <div key={g}>
              <h3>{groupLabel('fbad2', g)}</h3>
              <Bracket league="fbad2" series={season.bracket!.series.filter(s => s.group === g)} teams={teamMap} season={n} group={g} open={null} />
            </div>
          ))}
        </div>
      )}
      {season.promotion && season.promotion.length > 0 && (
        <div>
          <h2 className="section-title">Promotion and relegation</h2>
          <ul className="plain-list">
            {season.promotion.map(p => (
              <li key={p.league}>
                {groupLabel('fbad2', p.league)}: promoted {p.promoted.map(nameOf).join(', ') || '—'} · relegated {p.relegated.map(nameOf).join(', ') || '—'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
