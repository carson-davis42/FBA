import { useState } from 'react';
import { extendPlayer } from '../../engine/roster/moves';
import type { RosterState } from '../../engine/roster/state';
import { MAX_AMOUNT, payroll, RETIRE_AGE } from '../../engine/roster/rules';
import { useSaving, type Versions } from '../api';
import { commitMove, newBatchId } from '../roster/commit';
import { PlayerName } from './PlayerName';

export function ExtendDialog({ state, teamId, playerId, onClose, versions }: {
  state: RosterState; teamId: string; playerId: string; onClose: () => void; versions: Versions;
}) {
  const entry = state.fba.teams[teamId]?.find(e => e.playerId === playerId);
  const [amount, setAmount] = useState(String(entry?.contractAmount ?? ''));
  const [error, setError] = useState('');
  const saving = useSaving();
  if (!entry || entry.contractEnd == null || entry.contractAmount == null) return null;
  const name = state.players.players[playerId]?.name ?? 'Unnamed';
  const end = entry.contractEnd + 1;
  const years = end - state.season + 1;
  const result = extendPlayer(state, { teamId, playerId, amount: Number(amount) }, { batchId: 'preview' });
  const save = async () => {
    setError('');
    const move = extendPlayer(state, { teamId, playerId, amount: Number(amount) }, { batchId: newBatchId() });
    if (!move.ok) return setError(move.problems.join('; '));
    try {
      await commitMove(move, versions);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="card headed sign-panel edit-dialog" aria-label={`Extend ${name}`}>
      <h3>Extend <PlayerName id={playerId} name={name} /></h3>
      <p>Add one season: S{entry.contractEnd} → S{end} ({years} seasons remaining, including S{state.season}).</p>
      <p className="muted">New pay takes effect immediately. Pay can decrease by up to $1; remaining seasons cannot exceed pay. The $8 maximum and $25 team cap apply.</p>
      <p className="muted">The contract cannot go beyond the season the player plays at age {RETIRE_AGE}; he retires after that season.</p>
      <div className="form-row">
        <label>Amount ($) <input type="number" min={Math.max(1, entry.contractAmount - 1, years)} max={MAX_AMOUNT} step={1} value={amount} onChange={e => setAmount(e.target.value)} /></label>
      </div>
      {result.ok ? <p>New payroll: ${payroll(result.state.fba.teams[teamId], state.season)} / $25</p>
        : <ul className="problems">{result.problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {error && <p className="error">Save failed: {error}</p>}
      <div className="form-row">
        <button className="btn primary" disabled={saving || !result.ok} onClick={save}>Extend contract</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
