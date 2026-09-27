import { useState } from 'react';
import { Link } from 'react-router-dom';
import { startPool } from '../../engine/d2/pool';
import { d2Writes } from '../../engine/d2/state';
import type { TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { DraftBoard } from '../d2/DraftBoard';
import { PoolBuilder } from '../d2/PoolBuilder';
import { useD2State } from '../d2/useD2State';
import { commitDocs } from '../roster/commit';
import './roster.css';

export function D2DraftPage() {
  const { state, versions, error } = useD2State();
  const saving = useSaving();
  const { data: teams } = useDoc<TeamsFile>('leagues/fbad2/teams.json');
  const [actionError, setActionError] = useState('');

  if (error) return <p className="error">Couldn't load D2 data: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;

  if (!state.ratings?.locked) {
    return (
      <section>
        <h1>S{state.season} D2 draft</h1>
        <p className="muted">Finish D2 ratings first. <Link to="/league/fbad2/ratings">Go to the ratings reset ▸</Link></p>
      </section>
    );
  }

  if (!state.pool) {
    const start = async () => {
      const result = startPool(state);
      if (!result.ok) {
        setActionError(result.problems.join('; '));
        return;
      }
      setActionError('');
      try {
        await commitDocs(result.label, d2Writes(result), versions);
      } catch (e) {
        setActionError((e as Error).message);
      }
    };
    return (
      <section>
        <h1>S{state.season} D2 pool</h1>
        <p className="muted">Ranks every D2 player at each position by their new rating. You can reorder before locking.</p>
        <button className="btn primary" disabled={saving} onClick={start}>Start pool</button>
        {actionError && <p className="error">{actionError}</p>}
      </section>
    );
  }

  if (!state.pool.locked) return <PoolBuilder state={state} versions={versions} />;
  if (!state.draft) return <p className="error">The pool is locked but the draft is missing. Use ↶ Undo last move to unlock the pool.</p>;
  return <DraftBoard state={state} versions={versions} teams={teams} />;
}
