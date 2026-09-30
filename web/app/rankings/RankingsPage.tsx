import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MARK_EVERY, movement, rankingAt, rankingMarks } from '../../engine/awards/rankingsTimeline';
import { GROUP_ORDER } from '../../engine/season/standings';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useSeasonState } from '../season/useSeasonState';
import '../pages/season.css';
import '../playoffs/playoffs.css';

export function RankingsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, error } = useSeasonState(lg);
  const [pick, setPick] = useState('PL');
  const [chosen, setChosen] = useState<number | null>(null);

  if (!lg) return <p className="error">Rankings are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const header = <PageHeader title={`${LEAGUE_LABEL[lg]} power rankings · S${state.season}`} />;
  if (!state.schedule || !state.results) return <section className="stack">{header}<p className="muted">No schedule yet.</p></section>;

  const games = state.results.games;
  const marks = rankingMarks(lg, games.length, state.schedule.games.length);
  if (!marks.length) return <section className="stack">{header}<p className="muted">Rankings start after game {MARK_EVERY[lg]}.</p></section>;

  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const info = state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
  const mark = chosen !== null && marks.includes(chosen) ? chosen : marks[marks.length - 1];
  const group = lg === 'fbad2' ? pick : null;
  const rows = rankingAt(info, games, mark, group);
  const k = marks.indexOf(mark);
  const prev = k > 0 ? new Map(rankingAt(info, games, marks[k - 1], group).map(r => [r.teamId, r.rank])) : null;

  return (
    <section className="stack">
      {header}
      <div className="rank-toolbar">
        <label>Mark{' '}
          <select aria-label="Mark" value={String(mark)} onChange={e => setChosen(Number(e.target.value))}>
            {marks.map(m => <option key={m} value={String(m)}>After game {m}</option>)}
          </select>
        </label>
        {lg === 'fbad2' && (
          <div className="chips league-pick" role="group" aria-label="League">
            {GROUP_ORDER.fbad2.map(g => (
              <button key={g} type="button" className="chip" aria-pressed={pick === g} onClick={() => setPick(g)}>{g}</button>
            ))}
          </div>
        )}
      </div>
      <ol className="rank-list rankings">
        {rows.map(r => {
          const t = teams.get(r.teamId);
          const mv = movement(prev ? prev.get(r.teamId) ?? null : undefined, r.rank);
          return (
            <li key={r.teamId} className="rank-row">
              <span className="rank-num">{r.rank ?? '—'}</span>
              {t ? <TeamName team={t} season={state.season} size={28} /> : <span>{r.teamId}</span>}
              <span className="rank-rec">{r.w}-{r.l}</span>
              {mv ? <span className={`move${mv.startsWith('▲') ? ' up' : mv.startsWith('▼') ? ' down' : ''}`}>{mv}</span> : <span className="move" />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
