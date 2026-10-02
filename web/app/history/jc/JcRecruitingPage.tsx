import { useSearchParams } from 'react-router-dom';
import type { PlayersFile } from '../../../engine/shared/types';
import { useDoc } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { PlayerName } from '../../components/PlayerName';
import '../history.css';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { JcTeam, useJcRecruitingHistory, useJcTeams } from './useJc';

/** Past recruiting classes and transfer portals: pick a season, see its class and its portal as the history sheet lists them. */
export function JcRecruitingPage() {
  const { settled, teams } = useJcTeams();
  const rec = useJcRecruitingHistory();
  const [params, setParams] = useSearchParams();
  const players = useDoc<PlayersFile>(rec.file ? 'players.json' : null);
  if (!settled || !rec.settled) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <PageHeader kicker="FBAJC history" title="Recruiting classes" />
      <HistoryLeagueSwitch />
    </>
  );
  if (!rec.file || rec.file.classes.length === 0) {
    return <section className="stack">{header}<p className="muted">The past recruiting classes haven't been imported yet.</p></section>;
  }
  const classes = [...rec.file.classes].sort((a, b) => b.season - a.season);
  const asked = Number(params.get('class'));
  const cls = classes.find(c => c.season === asked) ?? classes[0];
  const nameOf = (id: string | null, name: string) => (id ? players.data?.players[id]?.name ?? name : name);
  const school = (teamId: string | null, name: string | null) => (name ? <JcTeam teams={teams} teamId={teamId} name={name} season={cls.season} size={18} /> : '—');
  const rated = cls.recruits.some(r => r.rating !== null);
  const consensus = cls.recruits.some(r => r.consensus !== null);
  const stars = cls.recruits.some(r => r.stars !== null);
  return (
    <section className="stack">
      {header}
      <label className="muted">
        Class{' '}
        <select aria-label="Class" value={cls.season} onChange={e => setParams({ class: e.target.value })}>
          {classes.map(c => <option key={c.season} value={c.season}>S{c.season}</option>)}
        </select>
      </label>
      <h2 className="section-title">Class of S{cls.season} · {cls.recruits.length}</h2>
      {cls.recruits.length === 0 ? <p className="muted">No class listed.</p> : (
        <div className="table-wrap">
          <table className="stat-table" aria-label={`Class of S${cls.season}`}>
            <thead><tr><th className="n">#</th><th>Name</th><th>Pos</th>{stars && <th>Stars</th>}{rated && <th className="n">Rtg</th>}{consensus && <th className="n">Consensus</th>}<th>School</th></tr></thead>
            <tbody>
              {cls.recruits.map(r => (
                <tr key={`${r.rank}-${r.name}`}>
                  <td className="n">{r.rank}</td>
                  <td><PlayerName id={r.playerId} name={nameOf(r.playerId, r.name)} /></td>
                  <td>{r.pos}</td>
                  {stars && <td>{r.stars !== null ? `${r.stars}★` : ''}</td>}
                  {rated && <td className="n">{r.rating ?? ''}</td>}
                  {consensus && <td className="n">{r.consensus ?? ''}</td>}
                  <td>{school(r.teamId, r.school)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="section-title">Transfer portal · {cls.portal.length}</h2>
      {cls.portal.length === 0 ? <p className="muted">No transfers listed.</p> : (
        <div className="table-wrap">
          <table className="stat-table" aria-label={`Transfer portal S${cls.season}`}>
            <thead><tr><th className="n">#</th><th>Name</th><th>Pos</th>{cls.portal.some(t => t.rating !== null) && <th className="n">Rtg</th>}<th>From</th><th>To</th></tr></thead>
            <tbody>
              {cls.portal.map(t => (
                <tr key={`${t.rank}-${t.name}`}>
                  <td className="n">{t.rank}</td>
                  <td><PlayerName id={t.playerId} name={nameOf(t.playerId, t.name)} /></td>
                  <td>{t.pos}</td>
                  {cls.portal.some(x => x.rating !== null) && <td className="n">{t.rating ?? ''}</td>}
                  <td>{school(t.fromTeamId, t.fromSchool)}</td>
                  <td>{school(t.toTeamId, t.toSchool)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
