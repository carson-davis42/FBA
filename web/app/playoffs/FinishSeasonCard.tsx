import { useRef, useState } from 'react';
import { leagueStepProblem } from '../../engine/season/moves';
import { seasonDocPath, type SeasonState } from '../../engine/season/state';
import { finishSeason } from '../../engine/season/wrapUp';
import type { RatingPauseFile } from '../../engine/shared/types';
import { ApiError, getDoc, useSaving, type Versions } from '../api';
import { newBatchId } from '../roster/commit';
import { commitSeason } from '../season/commitSeason';
import './playoffs.css';

const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;

/** Every rating-pause doc of the season (FBA only). A pause finished without a doc (test fixtures) is skipped. */
async function loadPauses(state: SeasonState): Promise<RatingPauseFile[]> {
  if (state.league !== 'fba') return [];
  const after = (state.schedule?.pauses ?? []).filter(p => p.kind === 'ratings').map(p => p.afterGame);
  const docs = await Promise.all(after.map(a => getDoc<RatingPauseFile>(seasonDocPath('ratingPause', 'fba', state.season, a)).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  })));
  return docs.filter((d): d is RatingPauseFile => d !== null);
}

/** "Finish S{n} season": one batch that writes the season record, locks the season and clears Undo. */
export function FinishSeasonCard({ state, versions }: { state: SeasonState; versions: Versions }) {
  const saving = useSaving();
  const started = useRef(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const name = LEAGUE_NAME[state.league];
  if (state.summary) return <div className="card headed"><p className="muted">The S{state.season} {name} season is finished.</p></div>;
  if (leagueStepProblem(state.calendar, state.league)) return null;

  const finish = async () => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setProblems([]);
    setSaveError('');
    try {
      const r = finishSeason(state, await loadPauses(state), { batchId: newBatchId() });
      if (!r.ok) {
        setProblems(r.problems);
        started.current = false;
        return;
      }
      await commitSeason(r, versions, { resetUndo: true });
    } catch (e) {
      setSaveError((e as Error).message);
      started.current = false;
    }
  };

  return (
    <div className="card headed finish-season">
      <div className="card-head"><h3>Wrap up the season</h3></div>
      {!saveError && <button className="btn primary" disabled={saving} onClick={finish}>Finish S{state.season} {name} season ▸</button>}
      {problems.length > 0 && <ul>{problems.map(p => <li key={p} className="error">{p}</li>)}</ul>}
      {saveError && (
        <p className="error">
          Save failed: {saveError} <button className="btn" disabled={saving} onClick={finish}>Retry</button>
        </p>
      )}
    </div>
  );
}
