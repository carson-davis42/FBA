import { useState } from 'react';
import { marketRows } from '../../engine/roster/market';
import { signPlayer, type SignInput } from '../../engine/roster/moves';
import { payroll } from '../../engine/roster/rules';
import type { RosterState } from '../../engine/roster/state';
import type { SeasonPhase } from '../../engine/season/locks';
import type { TeamsFile } from '../../engine/shared/types';
import { useSaving, type Versions } from '../api';
import { commitMove, newBatchId } from '../roster/commit';

export function SignPanel({ state, teams, playerId, defaultTeam, onClose, versions, phase }: {
  state: RosterState; teams: TeamsFile; playerId: string; defaultTeam: string; onClose: () => void; versions: Versions; phase?: SeasonPhase;
}) {
  const found = marketRows(state).find(r => r.playerId === playerId);
  const own = Object.entries(state.fba.teams).flatMap(([t, es]) => es.filter(e => e.playerId === playerId).map(e => ({ t, e })))[0];
  const row = found ?? (own ? { playerId, name: state.players.players[playerId]?.name ?? 'Unnamed', position: own.e.position, age: own.e.age, rating: own.e.rating, scale: 'FBA' as const, type: 'Expired' as const, from: own.t } : undefined);
  const [teamId, setTeamId] = useState(defaultTeam);
  const [years, setYears] = useState(1);
  const [amount, setAmount] = useState(1);
  const [rating, setRating] = useState('');
  const [conflict, setConflict] = useState<SignInput['conflict']>('release');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useSaving();
  if (!row) return null;

  const needsRating = row.scale === 'D2' || row.rating === null;
  const input: SignInput = { playerId, teamId, years, amount, rating: rating === '' ? undefined : Number(rating), conflict };
  const preview = teamId ? signPlayer(state, input, { batchId: 'preview', phase }) : null;
  const occupant = teamId ? state.fba.teams[teamId]?.find(e => e.position === row.position && e.playerId !== null && e.playerId !== playerId) : undefined;
  const occupantName = occupant ? state.players.players[occupant.playerId!]?.name ?? 'Unnamed' : '';

  const sign = async () => {
    const result = signPlayer(state, input, { batchId: newBatchId(), phase });
    if (!result.ok) return;
    setBusy(true);
    setError('');
    try {
      await commitMove(result, versions);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card sign-panel" aria-label={`Sign ${row.name}`}>
      <h3>Sign {row.name} ({row.position}, {row.rating ?? 'unrated'}{row.scale === 'D2' ? ' D2' : ''})</h3>
      <div className="form-row">
        <label>Team
          <select value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">Choose…</option>
            {teams.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name} (${payroll(state.fba.teams[t.teamId] ?? [], state.season)})</option>)}
          </select>
        </label>
        <label>Years <input type="number" min={1} max={5} value={years} onChange={e => setYears(Number(e.target.value))} /></label>
        <label>Amount ($) <input type="number" min={1} max={8} value={amount} onChange={e => setAmount(Number(e.target.value))} /></label>
        {needsRating && <label>FBA rating <input type="number" min={1} max={99} value={rating} onChange={e => setRating(e.target.value)} /></label>}
      </div>
      {occupant && (
        <fieldset className="form-row">
          <legend>{teamId} already has {occupantName} at {row.position}</legend>
          {(['release', 'cut', 'keep'] as const).map(c => (
            <label key={c}><input type="radio" name="conflict" checked={conflict === c} onChange={() => setConflict(c)} />
              {c === 'release' ? `Release ${occupantName}` : c === 'cut' ? `Cut ${occupantName}` : 'Keep both for now'}</label>
          ))}
        </fieldset>
      )}
      {preview && !preview.ok && <ul className="problems">{preview.problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {preview?.ok && <p className="ok">✓ Ready to sign{preview.warnings.length ? `, but ${preview.warnings.join('; ')}` : ''}</p>}
      {error && <p className="error">Save failed: {error}</p>}
      <div className="form-row">
        <button className="btn primary" disabled={!preview?.ok || busy || saving} onClick={sign}>Sign</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
