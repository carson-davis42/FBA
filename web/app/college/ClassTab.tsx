import { useEffect, useState } from 'react';
import {
  addDraftRow, appendDraftRows, createClass, draftCounts, editDraftRow, editRecruit, parseClassList, removeDraftRow, removeRecruit,
} from '../../engine/college/recruiting';
import { collegeName, schoolName, type RecruitingResult, type RecruitingState } from '../../engine/college/state';
import { POSITIONS } from '../../engine/roster/rules';
import type { Position, RecruitingFile } from '../../engine/shared/types';
import { newBatchId } from '../roster/commit';
import '../pages/roster.css';
import './college.css';

interface Props {
  state: RecruitingState;
  saving: boolean;
  /** Applies a change to the recruiting doc (autosaved by the page). */
  onDraft: (change: (current: RecruitingFile) => RecruitingFile) => void;
  /** Saves a move's result as one batch (the page shows refusals). */
  onRun: (result: RecruitingResult) => void;
}

/** A text box that saves on blur (or Enter), like the rating box. */
function TextField({ label, value, disabled, onSave }: { label: string; value: string; disabled: boolean; onSave: (value: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      type="text" aria-label={label} value={text} disabled={disabled}
      onChange={e => setText(e.target.value)}
      onBlur={() => { if (text !== value) onSave(text); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

function PositionSelect({ label, value, disabled, onChange }: { label: string; value: Position; disabled: boolean; onChange: (p: Position) => void }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value as Position)}>
      {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

/** Create S{n+1} Class: the class draft (names and positions) until "Create class", then the recruit list. */
export function ClassTab({ state, saving, onDraft, onRun }: Props) {
  const [paste, setPaste] = useState('');
  const [bad, setBad] = useState<string[]>([]);
  const doc = state.recruiting;
  if (doc.created) return <CreatedClass state={state} saving={saving} onRun={onRun} />;
  const locked = doc.locked;
  const counts = draftCounts(doc);
  const addPasted = () => {
    const parsed = parseClassList(paste);
    if (parsed.rows.length) onDraft(cur => appendDraftRows(cur, parsed.rows));
    setBad(parsed.bad);
    setPaste(parsed.bad.join('\n'));
  };
  return (
    <div>
      <p className="muted">
        Enter the S{doc.classOf} class: a name and a position for each recruit. Ratings and stars come at Rank S{doc.classOf} Class.
      </p>
      <p>{`${POSITIONS.map(p => `${p} ${counts[p]}`).join(' · ')} · ${doc.classDraft.length} total`}</p>
      <div className="table-wrap">
        <table className="board-table" aria-label="Class draft">
          <thead><tr><th className="n">#</th><th>Name</th><th>Pos</th><th><span className="muted">Remove</span></th></tr></thead>
          <tbody>
            {doc.classDraft.map((r, i) => (
              <tr key={i}>
                <td className="n">{i + 1}</td>
                <td><TextField label={`Name ${i + 1}`} value={r.name} disabled={locked} onSave={v => onDraft(cur => editDraftRow(cur, i, { name: v }))} /></td>
                <td><PositionSelect label={`Position ${i + 1}`} value={r.position} disabled={locked} onChange={p => onDraft(cur => editDraftRow(cur, i, { position: p }))} /></td>
                <td><button type="button" className="btn" aria-label={`Remove row ${i + 1}`} disabled={locked} onClick={() => onDraft(cur => removeDraftRow(cur, i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button type="button" className="btn" disabled={locked} onClick={() => onDraft(cur => addDraftRow(cur, { name: '', position: 'PG' }))}>Add recruit</button>
      </div>
      <h3>Paste list</h3>
      <p className="muted">One recruit per line: "Name, POS" or "Name", a tab, then "POS".</p>
      <textarea className="paste" aria-label="Paste list" value={paste} disabled={locked} onChange={e => setPaste(e.target.value)} />
      <div className="toolbar">
        <button type="button" className="btn" disabled={locked || !paste.trim()} onClick={addPasted}>Add pasted</button>
      </div>
      {bad.length > 0 && (
        <>
          <p className="error">These lines weren't added:</p>
          <ul className="problems" aria-label="Lines that weren't added">{bad.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </>
      )}
      <div className="toolbar">
        <button
          type="button" className="btn primary" disabled={saving || locked || doc.classDraft.length === 0}
          onClick={() => onRun(createClass(state, { batchId: newBatchId() }))}
        >
          Create class
        </button>
      </div>
    </div>
  );
}

function CreatedClass({ state, saving, onRun }: { state: RecruitingState; saving: boolean; onRun: (result: RecruitingResult) => void }) {
  const doc = state.recruiting;
  return (
    <div>
      <p className="muted">
        The S{doc.classOf} class has {doc.recruits.length} recruits. Rename a recruit or change a position while they are uncommitted; remove one only
        before any projections.
      </p>
      <div className="table-wrap">
        <table className="board-table" aria-label="Class">
          <thead><tr><th>Name</th><th>Pos</th><th>Status</th><th><span className="muted">Remove</span></th></tr></thead>
          <tbody>
            {doc.recruits.map(p => {
              const name = collegeName(state.players, p.playerId);
              const fixed = doc.locked || p.committedTo !== null;
              const projected = Object.keys(p.projections).length > 0;
              return (
                <tr key={p.playerId}>
                  <td><TextField label={`Name of ${name}`} value={name} disabled={fixed || saving} onSave={v => onRun(editRecruit(state, p.playerId, { name: v }))} /></td>
                  <td><PositionSelect label={`Position of ${name}`} value={p.position} disabled={fixed || saving} onChange={pos => onRun(editRecruit(state, p.playerId, { position: pos }))} /></td>
                  <td>{p.committedTo ? `Committed: ${schoolName(state, p.committedTo)}` : projected ? 'Projected' : 'Open'}</td>
                  <td>
                    <button
                      type="button" className="btn" aria-label={`Remove ${name}`} disabled={fixed || projected || saving}
                      title={p.committedTo ? 'Decommit first' : projected ? 'Remove the projections first' : undefined}
                      onClick={() => onRun(removeRecruit(state, p.playerId))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
