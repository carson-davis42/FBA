import { useMemo, useState } from 'react';
import { saveSelections, selectionProblems, suggestSelections } from '../../engine/allstar/selection';
import { POSITIONS } from '../../engine/roster/rules';
import { playerSeasonStats } from '../../engine/season/ratingPause';
import type { AllStarSelections } from '../../engine/shared/types';
import type { StepProps } from './types';

const idFrom = (text: string) => /\((p\d{5})\)$/.exec(text.trim())?.[1] ?? '';

export function SelectionStep({ state, doc, list, readOnly, saving, save }: StepProps) {
  const ppg = useMemo(() => {
    const stats = playerSeasonStats(state.results);
    return new Map([...stats].map(([id, s]) => [id, s.games ? s.pts / s.games : 0]));
  }, [state.results]);
  const [sel, setSel] = useState<AllStarSelections>(() => doc?.selections ?? suggestSelections(list, ppg));
  const [ycText, setYcText] = useState<string[]>(() => {
    const names = (doc?.selections?.youngCaptains ?? []).map(id => `${state.players.players[id]?.name ?? id} (${id})`);
    return [0, 1, 2, 3].map(i => names[i] ?? '');
  });
  const current: AllStarSelections = { ...sel, youngCaptains: ycText.map(idFrom).filter(Boolean) };
  const problems = selectionProblems(current, list, state.players);
  const byId = new Map(list.map(p => [p.playerId, p]));
  const counts = (ids: string[]) => POSITIONS.map(p => `${p} ${ids.filter(id => byId.get(id)?.position === p).length}`).join(' · ');
  const best = [...list].sort((a, b) => b.rating - a.rating || (ppg.get(b.playerId) ?? 0) - (ppg.get(a.playerId) ?? 0) || a.name.localeCompare(b.name));
  const youngFirst = [...best.filter(p => p.restricted), ...best.filter(p => !p.restricted)];
  const registry = Object.values(state.players.players);

  const toggle = (key: 'allStars' | 'youngStars', id: string) => setSel(s => {
    const has = s[key].includes(id);
    const next = { ...s, [key]: has ? s[key].filter(x => x !== id) : [...s[key], id] };
    return key === 'allStars' && has ? { ...next, captains: s.captains.filter(c => c !== id) } : next;
  });
  const setCaptain = (i: number, id: string) => setSel(s => {
    const c = [s.captains[0] ?? '', s.captains[1] ?? ''];
    c[i] = id;
    return { ...s, captains: c.filter(Boolean) };
  });

  const table = (label: string, key: 'allStars' | 'youngStars', rows: typeof list) => (
    <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
      <table className="pick-table" aria-label={label}>
        <thead><tr><th></th><th>Player</th><th>Pos</th><th>Team</th><th className="n">Rtg</th><th className="n">PPG</th></tr></thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.playerId}>
              <td><input type="checkbox" aria-label={`${label}: ${p.name}`} checked={sel[key].includes(p.playerId)} disabled={readOnly} onChange={() => toggle(key, p.playerId)} /></td>
              <td>{p.name}{p.restricted && key === 'youngStars' ? ' · rookie deal' : ''}</td><td>{p.position}</td><td>{p.teamId}</td>
              <td className="n">{p.rating}</td><td className="n">{(ppg.get(p.playerId) ?? 0).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="card">
        <h3>All-Stars · {sel.allStars.length}/28 · {counts(sel.allStars)} (4–11 per position)</h3>
        {[0, 1].map(i => (
          <label key={i}>ASG captain {i + 1}{' '}
            <select value={sel.captains[i] ?? ''} disabled={readOnly} onChange={e => setCaptain(i, e.target.value)}>
              <option value="">—</option>
              {sel.allStars.map(id => <option key={id} value={id}>{byId.get(id)?.name ?? id}</option>)}
            </select>
          </label>
        ))}
        {table('All-Stars', 'allStars', best)}
      </div>
      <div className="card">
        <h3>Young-Stars · {sel.youngStars.length}/20 · {counts(sel.youngStars)} (2–7 per position)</h3>
        {table('Young-Stars', 'youngStars', youngFirst)}
        <datalist id="registry-players">
          {registry.map(p => <option key={p.id} value={`${p.name} (${p.id})`} />)}
        </datalist>
        {[0, 1, 2, 3].map(i => (
          <label key={i}>Young-Star captain {i + 1}{' '}
            <input list="registry-players" aria-label={`Young-Star captain ${i + 1}`} value={ycText[i]} disabled={readOnly}
              onChange={e => setYcText(t => t.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      {!readOnly && problems.length > 0 && <ul className="problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {!readOnly && (
        <button className="btn primary" disabled={saving || problems.length > 0} onClick={() => save(saveSelections(doc, current, state.season, list, state.players))}>
          Save selections
        </button>
      )}
    </div>
  );
}
