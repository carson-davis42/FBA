import { useRef, useState } from 'react';
import { finalsMvpCandidates, pickFinalsMvp } from '../../engine/playoffs/moves';
import { playerName, type SeasonState } from '../../engine/season/state';
import { groupLabel } from '../../engine/shared/leagues';
import { useSaving, type Versions } from '../api';
import { commitSeason } from '../season/commitSeason';

/** Pick (or change) one champion's Finals MVP (FBA) or Series MVP (D2). After wrap-up it only reports the pick. */
export function FinalsMvpCard({ state, versions, group }: { state: SeasonState; versions: Versions; group: string | null }) {
  const saving = useSaving();
  const started = useRef(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const title = group === null ? 'Finals MVP' : `${groupLabel(state.league, group)} Series MVP`;
  const champion = state.playoffs?.outcome?.champions.find(c => c.group === group);
  const picked = champion?.finalsMvp ?? null;

  if (state.summary) return picked ? <p>{title}: {playerName(state, picked)}</p> : null;

  const pick = async (playerId: string) => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setProblems([]);
    setSaveError('');
    try {
      const r = pickFinalsMvp(state, group, playerId);
      if (!r.ok) {
        setProblems(r.problems);
        return;
      }
      await commitSeason(r, versions);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      started.current = false;
    }
  };

  const rows = finalsMvpCandidates(state, group);
  return (
    <div className="finals-mvp">
      <h3>{title}</h3>
      <table className="board-table" aria-label={title}>
        <thead><tr><th>Player</th><th>GP</th><th>PPG</th><th /></tr></thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.playerId}>
              <td>{c.name}</td>
              <td>{c.gp}</td>
              <td>{c.ppg.toFixed(1)}</td>
              <td>{c.playerId === picked ? <b>{title === 'Finals MVP' ? 'Finals MVP' : 'Series MVP'}</b> : <button className="btn" disabled={saving} onClick={() => pick(c.playerId)}>Pick</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {problems.length > 0 && <p className="error">{problems.join('; ')}</p>}
      {saveError && <p className="error">Save failed: {saveError}</p>}
    </div>
  );
}
