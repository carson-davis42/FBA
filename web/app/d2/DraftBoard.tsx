import { useEffect, useState } from 'react';
import {
  availableFor, isDraftPickLabel, makePick, neededPositions, onTheClock, rerollOrder, skipPick,
} from '../../engine/d2/draft';
import { d2Name, d2Writes, type D2Result, type D2State } from '../../engine/d2/state';
import type { TeamsFile } from '../../engine/shared/types';
import { peekUndo, undoLast, useSaving, type Versions } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamMark } from '../components/TeamMark';
import { TeamName } from '../components/TeamName';
import { commitDocs, newBatchId } from '../roster/commit';
import '../pages/roster.css';
import '../offseason/offseason.css';

export function DraftBoard({ state, versions, teams }: { state: D2State; versions: Versions; teams: TeamsFile | undefined }) {
  const saving = useSaving();
  const [selected, setSelected] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [undoState, setUndoState] = useState<{ label: string | null; blocked: boolean }>({ label: null, blocked: false });

  useEffect(() => {
    let live = true;
    const refresh = () => {
      peekUndo().then(
        p => { if (live) setUndoState(p.available ? { label: p.label, blocked: p.blockedBy !== null } : { label: null, blocked: false }); },
        () => undefined,
      );
    };
    refresh();
    window.addEventListener('doc-saved', refresh);
    return () => {
      live = false;
      window.removeEventListener('doc-saved', refresh);
    };
  }, []);

  const draft = state.draft!;
  const teamName = (id: string) => teams?.teams.find(t => t.teamId === id)?.name ?? id;
  const teamCell = (id: string) => {
    const t = teams?.teams.find(x => x.teamId === id);
    return t ? <TeamName team={t} season={state.season} /> : id;
  };

  // Clear any locally-selected player whenever the clock moves (a pick, a skip, an undo, or
  // another tab's change) — a stale selection could otherwise resurface a "Draft X → team"
  // button for a team or pick that never chose that player.
  useEffect(() => {
    setSelected(null);
  }, [draft.picks.length, draft.tickets.join(',')]);

  const run = async (result: D2Result) => {
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return;
    }
    setActionError('');
    try {
      await commitDocs(result.label, d2Writes(result), versions);
      setSelected(null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const undo = async () => {
    setActionError('');
    setSelected(null);
    try {
      await undoLast();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const undoButton = isDraftPickLabel(undoState.label) && !undoState.blocked
    && <button className="btn" disabled={saving} onClick={undo}>↶ Undo last pick</button>;
  const order = (
    <ol className="pick-order">
      {draft.tickets.map((teamId, i) => {
        const pick = draft.picks[i];
        const now = !draft.locked && i === draft.picks.length;
        return (
          <li key={i} className={now ? 'now' : pick ? 'done' : undefined}>
            <span className="rank">#{i + 1}</span> {teamCell(teamId)}
            {pick && <> <span className="chip">{pick.playerId ? `${pick.position}-${d2Name(state, pick.playerId)}` : 'skipped'}</span></>}
            {now && <strong> ← on the clock</strong>}
          </li>
        );
      })}
    </ol>
  );

  if (draft.locked) {
    return (
      <section className="stack">
        <PageHeader kicker="FBAD2" title={`S${state.season} D2 draft`} />
        <p className="muted">The D2 draft is finished. Every pick is listed below and in the D2 transactions.</p>
        {undoButton && <div className="card toolbar">{undoButton}</div>}
        {actionError && <p className="error">{actionError}</p>}
        <div className="card">{order}</div>
      </section>
    );
  }

  const clock = onTheClock(draft)!;
  const needs = neededPositions(state, clock.teamId);
  const available = availableFor(state, clock.teamId);
  const chosen = available.find(p => p.playerId === selected);
  const roster = state.d2.teams[clock.teamId] ?? [];
  const clockTeam = teams?.teams.find(t => t.teamId === clock.teamId);

  return (
    <section className="stack">
      <PageHeader kicker="FBAD2" title={`S${state.season} D2 draft`} />
      {actionError && <p className="error">{actionError}</p>}
      <div className="draft-grid">
        <div className="card">
          <h3>Pick order · {draft.picks.length} of {draft.tickets.length} made</h3>
          {order}
          <div className="form-row">
            {draft.picks.length === 0 && <button className="btn" disabled={saving} onClick={() => run(rerollOrder(state, Math.random))}>🎲 Re-roll order</button>}
            {undoButton}
          </div>
        </div>
        <div className="card">
          <h3>{clockTeam && <TeamMark team={clockTeam} season={state.season} size={24} />} On the clock: #{clock.pickNo} {teamName(clock.teamId)}</h3>
          <p className="muted">Needs: {needs.join(', ')}</p>
          <div className="table-wrap">
            <table className="stat-table">
              <tbody>
                {roster.map(e => (
                  <tr key={e.position}><td>{e.position}</td><td>{e.playerId ? d2Name(state, e.playerId) : '—'}</td><td className="n">{e.rating ?? ''}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {available.length === 0 ? (
            <>
              <p>No eligible player is left at {needs.join(', ')}.</p>
              <button className="btn primary" disabled={saving} onClick={() => run(skipPick(state, { batchId: newBatchId() }))}>Skip pick</button>
            </>
          ) : (
            <>
              <h3>Available · {needs.join(', ')}</h3>
              <div className="table-wrap tall">
                <table className="stat-table market">
                  <thead><tr><th>Player</th><th>Pos</th><th className="n">Age</th><th className="n">D2 rtg</th></tr></thead>
                  <tbody>
                    {available.map(p => (
                      <tr key={p.playerId} className={p.playerId === selected ? 'selected' : undefined} onClick={() => setSelected(p.playerId)}>
                        <td>{d2Name(state, p.playerId)}</td><td>{p.position}</td><td className="n">{p.age ?? '—'}</td><td className="n">{p.rating ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {chosen && (
                <button className="btn primary" disabled={saving} onClick={() => run(makePick(state, chosen.playerId, { batchId: newBatchId() }))}>
                  Draft {d2Name(state, chosen.playerId)} → {teamName(clock.teamId)}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
