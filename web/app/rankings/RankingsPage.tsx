import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MARK_EVERY, movement, rankingAt, rankingMarks } from '../../engine/awards/rankingsTimeline';
import { GROUP_ORDER } from '../../engine/season/standings';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import { LeagueTabs } from '../components/LeagueTabs';
import { TeamMark } from '../components/TeamMark';
import { useSeasonState } from '../season/useSeasonState';
import '../pages/season.css';

export function RankingsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, error } = useSeasonState(lg);
  const [pick, setPick] = useState('PL');
  const [chosen, setChosen] = useState<number | null>(null);

  if (!lg) return <p className="error">Rankings are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <h1>{LEAGUE_LABEL[lg]} power rankings · S{state.season}</h1>
      <LeagueTabs league={lg} />
    </>
  );
  if (!state.schedule || !state.results) return <section>{header}<p className="muted">No schedule yet.</p></section>;

  const games = state.results.games;
  const marks = rankingMarks(lg, games.length, state.schedule.games.length);
  if (!marks.length) return <section>{header}<p className="muted">Rankings start after game {MARK_EVERY[lg]}.</p></section>;

  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const info = state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
  const mark = chosen !== null && marks.includes(chosen) ? chosen : marks[marks.length - 1];
  const group = lg === 'fbad2' ? pick : null;
  const rows = rankingAt(info, games, mark, group);
  const k = marks.indexOf(mark);
  const prev = k > 0 ? new Map(rankingAt(info, games, marks[k - 1], group).map(r => [r.teamId, r.rank])) : null;

  return (
    <section>
      {header}
      <div className="toolbar">
        <label>Mark{' '}
          <select aria-label="Mark" value={String(mark)} onChange={e => setChosen(Number(e.target.value))}>
            {marks.map(m => <option key={m} value={String(m)}>After game {m}</option>)}
          </select>
        </label>
        {lg === 'fbad2' && (
          <div className="league-pick" role="group" aria-label="League">
            {GROUP_ORDER.fbad2.map(g => (
              <button key={g} type="button" className={`btn${pick === g ? ' primary' : ''}`} onClick={() => setPick(g)}>{g}</button>
            ))}
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table className="standings rankings">
          <thead><tr><th>#</th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">Move</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const t = teams.get(r.teamId);
              return (
                <tr key={r.teamId}>
                  <td>{r.rank ?? '—'}</td>
                  <td>{t && <TeamMark team={t} season={state.season} size={20} />} {t?.name ?? r.teamId}</td>
                  <td className="n">{r.w}</td><td className="n">{r.l}</td>
                  <td className="n">{movement(prev ? prev.get(r.teamId) ?? null : undefined, r.rank)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
