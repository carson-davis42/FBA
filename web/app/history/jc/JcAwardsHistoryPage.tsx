import { useState } from 'react';
import { Link } from 'react-router-dom';
import { jcSeasonLabel } from '../../../engine/history/jc';
import { NATIONAL_LABEL } from '../../../engine/jc/awards';
import { groupLabel } from '../../../engine/shared/leagues';
import { JC_NATIONAL_AWARDS, type PlayersFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { JcPerson, JcTeam, useJcTeams } from './useJc';

const SHORT: Record<string, string> = { POY: 'Player', FOY: 'Freshman', GOY: 'Guard', FWD: 'Forward', COY: 'Center', DPOY: 'Defensive' };

export function JcAwardsHistoryPage() {
  const { seasons, errors, error } = useHistory('fbajc');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useJcTeams();
  const [conf, setConf] = useState<string | null>(null);
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled) return <p className="muted">Loading…</p>;
  const roster = players.data;
  const ordered = [...seasons].filter(s => s.jc).sort((a, b) => b.season - a.season);
  const national = ordered.filter(s => s.jc!.national.length > 0);
  const confs = [...new Set(ordered.flatMap(s => s.jc!.conference.map(a => a.conf)))].sort((a, b) => groupLabel('fbajc', a).localeCompare(groupLabel('fbajc', b)));
  const chosen = conf && confs.includes(conf) ? conf : confs[0] ?? null;
  const confRows = chosen ? ordered.flatMap(s => s.jc!.conference.filter(a => a.conf === chosen).map(a => ({ season: s.season, a }))) : [];
  const who = (a: { playerId: string | null; teamId?: string | null; name?: string; school?: string | null }, season: number) => (
    <>
      <JcPerson id={a.playerId} name={a.name} players={roster} />
      {(a.school ?? a.teamId) && <> (<JcTeam teams={teams} teamId={a.teamId} name={(a.school ?? a.teamId)!} season={season} size={16} />)</>}
    </>
  );
  return (
    <section className="stack">
      <PageHeader kicker="FBAJC history" title="College Awards" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      {national.length === 0 && confRows.length === 0 && <p className="muted">No awards recorded yet.</p>}
      {national.length > 0 && (
        <div>
          <h2 className="section-title">National awards</h2>
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>Season</th>{JC_NATIONAL_AWARDS.map(a => <th key={a} title={NATIONAL_LABEL[a]}>{SHORT[a]}</th>)}</tr></thead>
              <tbody>
                {national.map(s => (
                  <tr key={s.season}>
                    <td><Link to={`/history/fbajc/season/${s.season}`}>{jcSeasonLabel(s.season)}</Link></td>
                    {JC_NATIONAL_AWARDS.map(a => {
                      const w = s.jc!.national.find(x => x.award === a);
                      return <td key={a}>{w ? who(w, s.season) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {chosen && (
        <div>
          <h2 className="section-title">Conference awards</h2>
          <label>
            Conference{' '}
            <select aria-label="Conference" value={chosen} onChange={e => setConf(e.target.value)}>
              {confs.map(c => <option key={c} value={c}>{groupLabel('fbajc', c)}</option>)}
            </select>
          </label>
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>Season</th><th>{groupLabel('fbajc', chosen)} player of the year</th></tr></thead>
              <tbody>
                {confRows.map(({ season, a }) => (
                  <tr key={season}>
                    <td><Link to={`/history/fbajc/season/${season}`}>{jcSeasonLabel(season)}</Link></td>
                    <td>{who(a, season)}</td>
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
