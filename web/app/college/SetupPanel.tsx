import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collegeSetupDocs, setupSummary } from '../../engine/college/setup';
import { useSaving, type Versions } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import type { CollegeSetupInput } from './useRecruitingState';

/** The one-time "Set up S{n} college rosters" card (D19), shown while the season's college rosters don't exist. */
export function SetupPanel({ season, setup, versions }: { season: number; setup: CollegeSetupInput; versions: Versions }) {
  const saving = useSaving();
  const started = useRef(false);
  const [error, setError] = useState('');
  if (setup.meta.rosterSeason.fbajc !== season - 1) return <p className="muted">The S{season} college rosters don't exist yet.</p>;
  // Adjust Age builds the S{n} college rosters; until it has run, there is nothing to set up here.
  if (setup.calendar.steps.find(s => s.id === 'adjust-age')?.done === false) {
    return (
      <div className="card headed">
        <p>Run Adjust Age to build the S{season} college rosters.</p>
        <Link to="/offseason/adjust-age">Adjust Age</Link>
      </div>
    );
  }
  if (!setup.prev) return <p className="error">The S{season - 1} college rosters are missing.</p>;
  const prev = setup.prev;
  const input = { meta: setup.meta, prev, proIds: setup.proIds, rostersExist: false };
  const preview = collegeSetupDocs(input, { batchId: 'preview' });
  if (!preview.ok) return <ul className="problems">{preview.problems.map(p => <li key={p}>{p}</li>)}</ul>;

  const go = async () => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setError('');
    const r = collegeSetupDocs(input, { batchId: newBatchId() });
    if (!r.ok) {
      setError(r.problems.join('; '));
      started.current = false;
      return;
    }
    try {
      await commitDocs(r.label, r.writes, versions);
    } catch (e) {
      setError((e as Error).message);
      started.current = false;
    }
  };

  return (
    <div className="card headed">
      <h3>Set up S{season} college rosters</h3>
      <p>
        The S{season} college rosters are built from S{season - 1}: class years move up, every Senior leaves, and players now in the pros
        leave. The gaps are holes for the new class and for transfers.
      </p>
      <p><strong>{setupSummary(preview.counts)}</strong></p>
      <button type="button" className="btn primary" disabled={saving} onClick={go}>Set up S{season} college rosters</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
