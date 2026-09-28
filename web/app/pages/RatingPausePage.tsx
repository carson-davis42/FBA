import { useState } from 'react';
import { Link } from 'react-router-dom';
import { POSITIONS } from '../../engine/roster/rules';
import { finishRatingPause, MIN_PAUSE_GAMES, setPauseRating, startRatingPause } from '../../engine/season/ratingPause';
import { blockingPause, playerName, seasonDocPath, type SeasonResult } from '../../engine/season/state';
import type { Position, RatingPauseFile } from '../../engine/shared/types';
import { useSaving } from '../api';
import { RatingInput } from '../components/RatingInput';
import { newBatchId } from '../roster/commit';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { useAutosaveDoc } from '../useAutosaveDoc';
import './roster.css';
import './season.css';

type Tab = 'ALL' | Position;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

export function RatingPausePage() {
  const { state, versions, error } = useSeasonState('fba');
  const saving = useSaving();
  const pause = state ? blockingPause(state) : null;
  const due = pause?.kind === 'ratings' ? pause : null;
  const path = state && due ? seasonDocPath('ratingPause', 'fba', state.season, due.afterGame) : '';
  const current = state?.ratingPause && due && state.ratingPause.afterGame === due.afterGame ? state.ratingPause : undefined;
  const autosave = useAutosaveDoc<RatingPauseFile>(path, current, versions[path] ?? null);
  const [tab, setTab] = useState<Tab>('ALL');
  const [message, setMessage] = useState('');

  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const title = <h1>S{state.season} rating adjustments</h1>;
  if (!due) {
    return <section>{title}<p className="muted">No rating adjustment is due right now. <Link to="/league/fba/scores">Back to scores ▸</Link></p></section>;
  }

  const run = async (r: SeasonResult) => {
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    setMessage('');
    try {
      await commitSeason(r, { ...versions, [path]: autosave.version });
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const doc = autosave.doc ?? current;
  if (!doc) {
    return (
      <section>
        {title}
        <p className="muted">
          Pause after game {due.afterGame}. The app suggests changes from each player's scoring so far (players with at least {MIN_PAUSE_GAMES} games).
        </p>
        <button className="btn primary" disabled={saving} onClick={() => run(startRatingPause(state))}>Start rating adjustments</button>
        {message && <p className="error">{message}</p>}
      </section>
    );
  }

  const name = (id: string) => playerName(state, id);
  const rows = doc.players
    .filter(r => tab === 'ALL' || r.position === tab)
    .sort((a, b) => b.rating - a.rating || name(a.playerId).localeCompare(name(b.playerId)));
  const changed = doc.players.filter(r => r.rating !== r.oldRating).length;

  return (
    <section>
      {title}
      <p className="muted">Pause after game {due.afterGame} · {changed} rating(s) changed</p>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(['ALL', ...POSITIONS] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t === 'ALL' ? 'All' : t}</button>
          ))}
        </div>
        <button className="btn primary" disabled={saving} onClick={() => run(finishRatingPause({ ...state, ratingPause: doc }, { batchId: newBatchId() }))}>Continue</button>
      </div>
      {autosave.error && <p className="error">{autosave.error}</p>}
      {message && <p className="error">{message}</p>}
      <div className="table-wrap">
        <table className="ratings-table">
          <thead>
            <tr><th>Player</th><th>Team</th><th className="n">G</th><th className="n">PPG</th><th className="n">Old</th><th className="n">Suggested</th><th className="n">New</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.playerId} className={r.rating !== r.oldRating ? 'edited' : undefined}>
                <td>{name(r.playerId)}{tab === 'ALL' && <span className="muted"> · {r.position}</span>}</td>
                <td>{r.teamId}</td>
                <td className="n">{r.games}</td>
                <td className="n">{r.ppg.toFixed(1)}</td>
                <td className="n">{r.oldRating}</td>
                <td className="n" title={r.perf === null ? `Fewer than ${MIN_PAUSE_GAMES} games` : `performance ${signed(r.perf)}`}>
                  {r.suggested === null ? '—' : <>{r.suggested} <span className={r.suggested > r.oldRating ? 'delta-up' : r.suggested < r.oldRating ? 'delta-down' : 'muted'}>{signed(r.suggested - r.oldRating)}</span></>}
                </td>
                <td className="n">
                  <RatingInput value={r.rating} name={name(r.playerId)} disabled={false} allowBlank={false} onSave={v => autosave.update(cur => setPauseRating(cur, r.playerId, v!))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
