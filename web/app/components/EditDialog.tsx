import { useState } from 'react';
import { editPlayer, editWarnings, type EditChanges, type EditInput } from '../../engine/roster/moves';
import type { RosterState } from '../../engine/roster/state';
import type { SeasonPhase } from '../../engine/season/locks';
import { useSaving, type Versions } from '../api';
import { commitMove, newBatchId } from '../roster/commit';

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export function EditDialog({ state, league, teamId, playerId, onClose, versions, phase }: {
  state: RosterState; league: 'fba' | 'fbad2'; teamId: string; playerId: string; onClose: () => void; versions: Versions; phase?: SeasonPhase;
}) {
  const entry = (league === 'fba' ? state.fba : state.d2).teams[teamId]?.find(e => e.playerId === playerId);
  const [rating, setRating] = useState(String(entry?.rating ?? ''));
  const [age, setAge] = useState(String(entry?.age ?? ''));
  const [end, setEnd] = useState(String(entry?.contractEnd ?? ''));
  const [amount, setAmount] = useState(String(entry?.contractAmount ?? ''));
  const [restricted, setRestricted] = useState(Boolean(entry?.restricted));
  const [error, setError] = useState('');
  const saving = useSaving();
  if (!entry) return null;
  const name = state.players.players[playerId]?.name ?? 'Unnamed';

  const changes: EditChanges = {};
  if (num(rating) !== (entry.rating ?? null)) changes.rating = num(rating);
  if (num(age) !== (entry.age ?? null)) changes.age = num(age);
  if (league === 'fba') {
    if (num(end) !== (entry.contractEnd ?? null)) changes.contractEnd = num(end);
    if (num(amount) !== (entry.contractAmount ?? null)) changes.contractAmount = num(amount);
    if (restricted !== Boolean(entry.restricted)) changes.restricted = restricted;
  }
  const input: EditInput = { league, teamId, playerId, changes };
  const warnings = editWarnings(state, input);

  const save = async () => {
    setError('');
    const result = editPlayer(state, input, { batchId: newBatchId(), phase });
    if (!result.ok) return setError(result.problems.join('; '));
    try {
      await commitMove(result, versions);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card headed sign-panel edit-dialog" aria-label={`Edit ${name}`}>
      <h3>Edit {name}</h3>
      <div className="form-row">
        <label>Rating <input type="number" value={rating} onChange={e => setRating(e.target.value)} /></label>
        <label>Age <input type="number" value={age} onChange={e => setAge(e.target.value)} /></label>
        {league === 'fba' && (
          <>
            <label>Contract end <input type="number" value={end} onChange={e => setEnd(e.target.value)} /></label>
            <label>Amount ($) <input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <label><input type="checkbox" checked={restricted} onChange={e => setRestricted(e.target.checked)} /> Restricted</label>
          </>
        )}
      </div>
      {warnings.length > 0 && <ul className="problems">{warnings.map(w => <li key={w}>⚠ {w}</li>)}</ul>}
      {error && <p className="error">Save failed: {error}</p>}
      <div className="form-row">
        <button className="btn primary" disabled={saving} onClick={save}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
