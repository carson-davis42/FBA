import { useState } from 'react';
import { Link } from 'react-router-dom';
import { makeCut, placesAt, positionList, positionsFilled, reopenCut } from '../../engine/rank/positionRanking';
import { D2_TOP_RANKED, isNewRow, topOf } from '../../engine/rank/ranking';
import { POSITIONS } from '../../engine/roster/rules';
import { POOL_CUTOFF } from '../../engine/d2/pool';
import { finishRatings, membershipBlockers, stagedRatings, startRatings, stretchedRatings } from '../../engine/d2/ratings';
import { d2DocPath, d2Name, d2Writes, type D2Result } from '../../engine/d2/state';
import type { RankingFile, RankingRow } from '../../engine/shared/types';
import { useSaving } from '../api';
import { FillPreview } from '../d2/FillPreview';
import { useD2State } from '../d2/useD2State';
import { PageHeader } from '../components/PageHeader';
import { PositionStage } from '../rank/PositionStage';
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
  const loaded = autosave.doc ?? state.ratings ?? undefined;
  // A reset saved by an older version is brought up to date on load (and when it is next saved): the suggestion ladder reaches the
  // roster slots, and a reset with nobody ranked starts at the position rankings.
  const current = (doc: RankingFile) => stagedRatings(stretchedRatings(state.d2, doc));
  const ratings = loaded && current(loaded);
  if (!ratings) {
    return (
      <section className="stack">
        {title}
        <div className="card">
          <p className="muted">
            Rank each position, best first, until its {POOL_CUTOFF} spots are full; everyone else goes to Reserves. Then build your top
            {' '}{D2_TOP_RANKED} from the best remaining player at each position and rate them (the app suggests the rating that held the same
            rank last season). The others are rated from their rank within their position.
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
  const staged = ratings.byPosition !== undefined;
  const name = (id: string) => d2Name(state, id);
  const teamLabel = (team: string | null, row?: RankingRow) => team ?? (row && isNewRow(shown, row) ? 'New' : 'Reserves');
  const onChange = (change: (doc: RankingFile) => RankingFile) => autosave.update(cur => change(current(cur)));
  const errors = (
    <>
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
    </>
  );

  if (staged && !ratings.locked && !ratings.cutMade) {
    const placed = POSITIONS.reduce((n, pos) => n + positionList(ratings, pos).length, 0);
    const places = POSITIONS.reduce((n, pos) => n + placesAt(ratings, pos), 0);
    const outOfDate = membershipBlockers(live);
    return (
      <section className="stack">
        {title}
        {errors}
        {outOfDate.length > 0 && <ul className="problems">{outOfDate.map(b => <li key={b}>{b}</li>)}</ul>}
        <PositionStage
          doc={shown} name={name} teamLabel={teamLabel} onChange={onChange}
          header={<p className="muted">Step 1 of 4: rank each position, best first, until it is full. {placed} of {places} placed.</p>}
        />
        <div className="card toolbar">
          <button type="button" className="btn primary" disabled={!positionsFilled(ratings)} onClick={() => onChange(doc => makeCut(doc))}>
            Cut: send the other {ratings.rows.length - places} to Reserves
          </button>
          <span className="muted">Step 2 of 4. {positionsFilled(ratings) ? 'Every position is full.' : 'Fill every position first.'}</span>
        </div>
      </section>
    );
  }

  const unranked = ratings.order.length < topOf(ratings);
  return (
    <section className="stack">
      {title}
      {ratings.locked && <div className="card"><p className="muted">D2 ratings are finished. <Link to="/league/fbad2/draft">Build the D2 pool ▸</Link></p></div>}
      {errors}
      {staged && !ratings.locked && (
        <div className="card toolbar">
          <span className="muted">
            {unranked
              ? `Step 3 of 4: build the top ${topOf(ratings)} from the best remaining player at each position.`
              : `Step 4 of 4: rate your top ${topOf(ratings)}. Everyone else is rated from their rank within their position.`}
          </span>
          {unranked && <button type="button" className="btn" onClick={() => onChange(reopenCut)}>Back to position rankings</button>}
        </div>
      )}
      <RankingTable
        doc={shown}
        positionCap={staged ? undefined : { spots: POOL_CUTOFF, label: 'D2 spots left per position' }}
        positionMerge={staged}
        name={name}
        teamLabel={teamLabel}
        otherLabel="FBA"
        onChange={onChange}
        extraBlockers={membershipBlockers(live)}
        finishLabel="Finish ratings"
        onFinish={() => run(finishRatings(live, { batchId: newBatchId() }))}
        busy={saving}
        beforeFinish={staged && !ratings.locked && !unranked && <FillPreview doc={shown} name={name} teamLabel={teamLabel} />}
      />
    </section>
  );
}
