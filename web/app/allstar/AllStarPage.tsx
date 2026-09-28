import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type AllStarResult, fbaPlayers } from '../../engine/allstar/common';
import { allStarStep, type AllStarStep, STEP_LABEL, STEP_ORDER } from '../../engine/allstar/steps';
import { blockingPause, seasonDocPath } from '../../engine/season/state';
import { useSaving } from '../api';
import { commitDocs } from '../roster/commit';
import { useSeasonState } from '../season/useSeasonState';
import { AsgDraftStep } from './AsgDraftStep';
import { ContestDrawStep } from './ContestDrawStep';
import { SelectionStep } from './SelectionStep';
import type { StepProps } from './types';
import '../pages/roster.css';
import '../pages/season.css';

export function AllStarPage() {
  const { state, versions, error } = useSeasonState('fba');
  const saving = useSaving();
  const [view, setView] = useState<AllStarStep | null>(null);
  const [message, setMessage] = useState('');

  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const title = <h1>S{state.season} All-Star weekend</h1>;
  const doc = state.allstar;
  const step = allStarStep(doc);
  const pause = blockingPause(state);
  if (step !== 'done' && pause?.kind !== 'allstar') {
    return <section>{title}<p className="muted">The All-Star weekend happens at the ¾ pause. <Link to="/league/fba/scores">Back to scores ▸</Link></p></section>;
  }

  const list = fbaPlayers(state.rosters, state.players);
  const path = seasonDocPath('allstar', 'fba', state.season);
  const save = async (r: AllStarResult): Promise<boolean> => {
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return false;
    }
    setMessage('');
    try {
      await commitDocs(r.label, [{ path, doc: r.doc }], versions);
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  };
  const current: AllStarStep = step === 'done' ? 'wrapup' : step;
  const shown = view ?? current;
  const reached = (s: AllStarStep) => STEP_ORDER.indexOf(s) <= STEP_ORDER.indexOf(current);
  const props: StepProps = { state, doc, list, saving, save, readOnly: shown !== current || step === 'done' };

  return (
    <section>
      {title}
      <div className="step-bar">
        {STEP_ORDER.map((s, i) => (
          <button key={s} className={shown === s ? 'on' : reached(s) && s !== current ? 'done' : undefined} disabled={!reached(s)} onClick={() => setView(s === current ? null : s)}>
            {i + 1} {STEP_LABEL[s]}{reached(s) && s !== current ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {message && <p className="error">{message}</p>}
      {shown === 'selections' && <SelectionStep {...props} />}
      {shown === 'asgDraft' && <AsgDraftStep {...props} />}
      {shown === 'contestDraw' && <ContestDrawStep {...props} />}
      {!['selections', 'asgDraft', 'contestDraw'].includes(shown) && (
        <p className="muted">This event is built in the next task.</p>
      )}
    </section>
  );
}
