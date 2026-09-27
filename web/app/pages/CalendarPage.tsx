import { useState } from 'react';
import { Link } from 'react-router-dom';
import { currentStepIndex, markCurrentDone, reopenLast } from '../../engine/shared/calendar';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile } from '../../engine/shared/types';
import { putDoc, useDoc } from '../api';
import { TOOL_STEPS } from '../stepRoutes';
import './pages.css';

export function CalendarPage() {
  const { data: cal, error } = useDoc<CalendarFile>('calendar.json');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <p className="error">Couldn't load the calendar: {error.message}</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const i = currentStepIndex(cal);
  const save = async (next: CalendarFile) => {
    setBusy(true);
    setSaveError(null);
    try {
      await putDoc('calendar.json', next);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1>Season {cal.season} calendar</h1>
      <div className="cal-actions">
        {i >= 0 && TOOL_STEPS[cal.steps[i].id] && (
          <Link className="btn primary" to={TOOL_STEPS[cal.steps[i].id]}>Open {cal.steps[i].label} ▸</Link>
        )}
        {i >= 0 && !TOOL_STEPS[cal.steps[i].id] && (
          <button className="btn primary" disabled={busy} onClick={() => save(markCurrentDone(cal))} aria-label={`Mark "${cal.steps[i].label}" done`}>
            ✓ Mark "{cal.steps[i].label}" done
          </button>
        )}
        <button className="btn" disabled={busy || i === 0} onClick={() => save(reopenLast(cal))} aria-label="Reopen previous step">
          ↺ Reopen previous step
        </button>
      </div>
      {saveError && <p className="error">Save failed: {saveError}</p>}
      <p className="muted">Until each league and offseason tool is built, mark steps done here once you've handled them.</p>
      <div className="card">
        <ol className="steps">
          {cal.steps.map((s, j) => (
            <li key={s.id} className={[s.sub ? 'sub' : '', s.done ? 'done' : '', j === i ? 'current' : ''].join(' ')}>
              <span className="mark">{s.done ? '✓' : j === i ? '▶' : '•'}</span>
              <span>{s.label}</span>
              {s.league && <span className="tag">{LEAGUE_LABEL[s.league]}</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
