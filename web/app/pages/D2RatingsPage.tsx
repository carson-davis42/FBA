import { useState } from 'react';
import { Link } from 'react-router-dom';
import { finishRatings, ratingsBlockers, setRating, startRatings } from '../../engine/d2/ratings';
import { d2DocPath, d2Name, d2Writes, type D2Result } from '../../engine/d2/state';
import { POSITIONS } from '../../engine/roster/rules';
import type { D2RatingRow, D2RatingsFile, Position } from '../../engine/shared/types';
import { useSaving } from '../api';
import { RatingInput } from '../components/RatingInput';
import { useD2State } from '../d2/useD2State';
import { commitDocs, newBatchId } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import './roster.css';

type Tab = 'ALL' | Position;
type Filter = 'all' | 'needs' | 'edited' | 'roster' | 'reserves' | 'fba';

const FILTERS: [Filter, string][] = [
  ['all', 'All'], ['needs', 'Needs rating'], ['edited', 'Edited'], ['roster', 'D2 roster'], ['reserves', 'Reserves'], ['fba', 'FBA FA'],
];

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
const isEdited = (r: D2RatingRow) => r.suggested !== null && r.rating !== r.suggested;

export function D2RatingsPage() {
  const { state, versions, error } = useD2State();
  const saving = useSaving();
  const path = state ? d2DocPath('ratings', state.season) : '';
  const autosave = useAutosaveDoc<D2RatingsFile>(path, state?.ratings ?? undefined, versions[path] ?? null);
  const [tab, setTab] = useState<Tab>('ALL');
  const [filter, setFilter] = useState<Filter>('all');
  const [actionError, setActionError] = useState('');

  if (error) return <p className="error">Couldn't load D2 data: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const title = <h1>S{state.season} D2 ratings reset</h1>;

  const run = async (result: D2Result) => {
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return;
    }
    setActionError('');
    try {
      await commitDocs(result.label, d2Writes(result), { ...versions, [path]: autosave.version });
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  if (!state.freeAgencyClosed) {
    return <section>{title}<p className="muted">Close free agency first. <Link to="/league/fba/free-agency">Go to free agency ▸</Link></p></section>;
  }
  const ratings = autosave.doc ?? state.ratings ?? undefined;
  if (!ratings) {
    return (
      <section>
        {title}
        <p className="muted">
          The app suggests a new D2 rating for every D2 roster player and Reserve from age, last season's scoring, and a little luck.
          Players with no D2 rating start blank for you to rate.
        </p>
        <button className="btn primary" disabled={saving} onClick={() => run(startRatings(state, Math.random))}>Start ratings reset</button>
        {actionError && <p className="error">{actionError}</p>}
      </section>
    );
  }

  const live = { ...state, ratings };
  const locked = ratings.locked;
  const blockers = ratingsBlockers(live);
  const fromFba = new Set(state.reserves.players.filter(p => p.fromFba).map(p => p.playerId));
  const name = (id: string) => d2Name(state, id);
  const matches = (r: D2RatingRow) => {
    switch (filter) {
      case 'needs': return r.rating === null;
      case 'edited': return isEdited(r);
      case 'roster': return r.team !== null;
      case 'reserves': return r.team === null;
      case 'fba': return fromFba.has(r.playerId);
      default: return true;
    }
  };
  const rows = ratings.players.filter(r => (tab === 'ALL' || r.position === tab) && matches(r));
  const blank = rows.filter(r => r.rating === null).sort((a, b) => name(a.playerId).localeCompare(name(b.playerId)));
  const rated = rows.filter(r => r.rating !== null).sort((a, b) =>
    b.rating! - a.rating! || (a.age ?? 999) - (b.age ?? 999) || name(a.playerId).localeCompare(name(b.playerId)));
  const needCount = ratings.players.filter(r => r.rating === null).length;
  const tabCount = (t: Tab) => ratings.players.filter(r => t === 'ALL' || r.position === t).length;
  const save = (playerId: string, value: number | null) => autosave.update(cur => setRating(cur, playerId, value));

  const table = (list: D2RatingRow[]) => (
    <div className="table-wrap">
      <table className="ratings-table">
        <thead>
          <tr><th>Player</th><th className="n">Age</th><th>From</th><th className="n">Old</th><th className="n">Suggested</th><th className="n">New</th></tr>
        </thead>
        <tbody>
          {list.map(r => (
            <tr key={r.playerId} className={[r.rating === null ? 'needs' : '', isEdited(r) ? 'edited' : ''].filter(Boolean).join(' ') || undefined}>
              <td>{name(r.playerId)}{tab === 'ALL' && <span className="muted"> · {r.position}</span>}</td>
              <td className="n">{r.age ?? '—'}</td>
              <td>{r.team ?? 'Reserves'}{fromFba.has(r.playerId) && <> <span className="tag tag-d2">FBA FA</span></>}</td>
              <td className="n">{r.oldRating ?? '—'}</td>
              <td className="n" title={r.breakdown ? `age ${signed(r.breakdown.age)} · perf ${signed(r.breakdown.perf)} · luck ${signed(r.breakdown.luck)}` : undefined}>
                {r.suggested === null || r.oldRating === null ? '—' : (
                  <>
                    {r.suggested}{' '}
                    <span className={r.suggested > r.oldRating ? 'delta-up' : r.suggested < r.oldRating ? 'delta-down' : 'muted'}>{signed(r.suggested - r.oldRating)}</span>
                  </>
                )}
              </td>
              <td className="n"><RatingInput value={r.rating} name={name(r.playerId)} disabled={locked} allowBlank onSave={v => save(r.playerId, v)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section>
      {title}
      {locked && <p className="muted">D2 ratings are finished. <Link to="/league/fbad2/draft">Build the D2 pool ▸</Link></p>}
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(['ALL', ...POSITIONS] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {t === 'ALL' ? 'All' : t} {tabCount(t)}
            </button>
          ))}
        </div>
        {!locked && <span className="tag tag-rookie">{needCount} need a rating</span>}
        {!locked && (
          <button className="btn primary" disabled={saving || blockers.length > 0} onClick={() => run(finishRatings(live, { batchId: newBatchId() }))}>
            Finish ratings
          </button>
        )}
      </div>
      {!locked && blockers.length > 0 && <ul className="problems">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
      <div className="chips">
        {FILTERS.map(([f, label]) => (
          <button key={f} className={`chip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
        ))}
      </div>
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {blank.length > 0 && <><h3>Needs a rating · {blank.length}</h3>{table(blank)}</>}
      <h3>Rated · {rated.length}</h3>
      {table(rated)}
    </section>
  );
}
