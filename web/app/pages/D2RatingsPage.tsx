import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isNewRow } from '../../engine/rank/ranking';
import { finishRatings, membershipBlockers, startRatings } from '../../engine/d2/ratings';
import { d2DocPath, d2Name, d2Writes, type D2Result } from '../../engine/d2/state';
import type { RankingFile } from '../../engine/shared/types';
import { useSaving } from '../api';
import { useD2State } from '../d2/useD2State';
import { PageHeader } from '../components/PageHeader';
import { RankingTable } from '../rank/RankingTable';
import { commitDocs, newBatchId } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import './roster.css';
import '../offseason/offseason.css';

export function D2RatingsPage() {
  const { state, versions, error } = useD2State();
  const saving = useSaving();
  const path = state ? d2DocPath('ratings', state.season) : '';
  const autosave = useAutosaveDoc<RankingFile>(path, state?.ratings ?? undefined, versions[path] ?? null);
  const [actionError, setActionError] = useState('');

  if (error) return <p className="error">Couldn't load D2 data: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const title = <PageHeader kicker="FBAD2" title={`S${state.season} D2 ratings reset`} />;

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
    return <section className="stack">{title}<div className="card"><p className="muted">Close free agency first. <Link to="/league/fba/free-agency">Go to free agency ▸</Link></p></div></section>;
  }
  const ratings = autosave.doc ?? state.ratings ?? undefined;
  if (!ratings) {
    return (
      <section className="stack">
        {title}
        <div className="card">
          <p className="muted">
            Rank every D2 roster player and Reserve, best first, starting from last season's order. Once everyone is ranked, give each player
            a new rating; the app suggests the rating that held the same rank last season.
          </p>
          <button className="btn primary" disabled={saving} onClick={() => run(startRatings(state))}>Start ratings reset</button>
        </div>
        {actionError && <p className="error">{actionError}</p>}
      </section>
    );
  }

  // Docs started before `inLeague` existed: Reserves who weren't FBA free agents were already in the pool.
  const inPool = new Set(state.reserves.players.filter(p => !p.fromFba).map(p => p.playerId));
  const shown: RankingFile = { ...ratings, rows: ratings.rows.map(r => (r.team === null && r.prevRating === null && inPool.has(r.playerId) ? { ...r, inLeague: true } : r)) };
  const live = { ...state, ratings };
  return (
    <section className="stack">
      {title}
      {ratings.locked && <div className="card"><p className="muted">D2 ratings are finished. <Link to="/league/fbad2/draft">Build the D2 pool ▸</Link></p></div>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      <RankingTable
        doc={shown}
        name={id => d2Name(state, id)}
        teamLabel={(team, row) => team ?? (row && isNewRow(shown, row) ? 'New' : 'Reserves')}
        otherLabel="FBA"
        onChange={autosave.update}
        extraBlockers={membershipBlockers(live)}
        finishLabel="Finish ratings"
        onFinish={() => run(finishRatings(live, { batchId: newBatchId() }))}
        busy={saving}
      />
    </section>
  );
}
