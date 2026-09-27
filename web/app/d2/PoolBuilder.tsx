import { Fragment, useState } from 'react';
import {
  cutoffTies, lockPool, moveInOrder, POOL_CUTOFF, poolProblems, poolSummary, poolWarnings, rankedOrder,
} from '../../engine/d2/pool';
import { d2DocPath, d2Name, d2Writes, poolMembers, type D2State } from '../../engine/d2/state';
import { POSITIONS } from '../../engine/roster/rules';
import type { D2PoolFile, Position } from '../../engine/shared/types';
import { useSaving, type Versions } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';

export function PoolBuilder({ state, versions }: { state: D2State; versions: Versions }) {
  const saving = useSaving();
  const path = d2DocPath('pool', state.season);
  const autosave = useAutosaveDoc<D2PoolFile>(path, state.pool ?? undefined, versions[path] ?? null);
  const [tab, setTab] = useState<Position>('PG');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const pool = autosave.doc ?? state.pool;
  if (!pool) return null;

  const live: D2State = { ...state, pool };
  const summary = poolSummary(live);
  const problems = poolProblems(live);
  const warnings = poolWarnings(live);
  const ties = new Set(cutoffTies(live, tab));
  const members = new Map(poolMembers(state).map(m => [m.playerId, m]));
  const list = pool.order[tab];
  const move = (from: number, to: number) => autosave.update(cur => moveInOrder(cur, tab, from, to));

  const lock = async () => {
    const result = lockPool(live, { batchId: newBatchId() }, Math.random);
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

  return (
    <section>
      <h1>S{state.season} D2 pool</h1>
      <p className="muted">
        The top {POOL_CUTOFF} at each position make the D2. Drag a player, use ↑/↓, or press Alt+↑ / Alt+↓ on a focused row to change the order.
        Locking the pool sends roster players below the line to Reserves and opens their spots for the draft.
      </p>
      <div className="table-wrap">
        <table className="pool-summary">
          <thead>
            <tr><th>Pos</th><th className="n">Pool</th><th className="n">Kept</th><th className="n">Bumped</th><th className="n">Draft pool</th><th className="n">Open slots</th></tr>
          </thead>
          <tbody>
            {POSITIONS.map(p => (
              <tr key={p}>
                <td>{p}</td><td className="n">{summary[p].pool}</td><td className="n">{summary[p].kept}</td><td className="n">{summary[p].bumped}</td>
                <td className="n">{summary[p].draftPool}</td><td className="n">{summary[p].openSlots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {warnings.map(w => <p key={w} className="error">{w}</p>)}
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {POSITIONS.map(p => (
            <button key={p} role="tab" aria-selected={tab === p} className={`tab${tab === p ? ' on' : ''}`} onClick={() => setTab(p)}>{p}</button>
          ))}
        </div>
        <button className="btn" disabled={saving} onClick={() => autosave.update(cur => ({ ...cur, order: rankedOrder(state) }))}>Reset to ratings order</button>
        <button className="btn primary" disabled={saving || problems.length > 0} onClick={lock}>Lock pool</button>
      </div>
      {problems.length > 0 && <ul className="problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      <ol className="pool-list">
        {list.map((id, i) => {
          const m = members.get(id);
          const name = d2Name(state, id);
          const below = i >= POOL_CUTOFF;
          const bumped = below && m !== undefined && m.team !== null;
          const cls = [ties.has(id) ? 'tie' : '', below ? 'below' : '', bumped ? 'bumped' : ''].filter(Boolean).join(' ') || undefined;
          return (
            <Fragment key={id}>
              <li
                className={cls} tabIndex={0} draggable aria-label={`${i + 1}. ${name}`}
                onDragStart={() => setDragFrom(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null) move(dragFrom, i);
                  setDragFrom(null);
                }}
                onKeyDown={e => {
                  if (!e.altKey) return;
                  if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
                }}
              >
                <span className="rank">{i + 1}</span>
                <span className="pname">{name}</span>
                <span className="muted">{m?.age ?? '—'}</span>
                <span className="n">{m?.rating ?? '—'}</span>
                <span>{m?.team ?? 'Reserves'}</span>
                {bumped && <span className="tag tag-expired">Bumped</span>}
                {ties.has(id) && <span className="tag tag-rookie">Tie</span>}
                <span className="row-actions">
                  <button className="btn" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                  <button className="btn" aria-label={`Move ${name} down`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                </span>
              </li>
              {i === POOL_CUTOFF - 1 && i < list.length - 1 && <li className="cutoff-row" aria-hidden="true">— cutoff: top {POOL_CUTOFF} —</li>}
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}
