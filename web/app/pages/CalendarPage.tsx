import { useState } from 'react';
import { Link } from 'react-router-dom';
import { currentStepIndex, markCurrentDone, reopenLast } from '../../engine/shared/calendar';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile } from '../../engine/shared/types';
import { putDoc, useDoc, useSaving } from '../api';
import { toolTarget } from '../stepRoutes';
import './pages.css';

export function CalendarPage() {
  const { data: cal, version, error } = useDoc<CalendarFile>('calendar.json');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useSaving();
  if (error) return <p className="error">Couldn't load the calendar: {error.message}</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const i = currentStepIndex(cal);
  const tool = i >= 0 ? toolTarget(cal.steps[i]) : null;
  const save = async (next: CalendarFile) => {
    setBusy(true);
    setSaveError(null);
    try {
      await putDoc('calendar.json', next, version);
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
        {tool && (
          <Link className="btn primary" to={tool}>Open {cal.steps[i].label} ▸</Link>
        )}
        {i >= 0 && !tool && (
          <button className="btn primary" disabled={busy || saving} onClick={() => save(markCurrentDone(cal))} aria-label={`Mark "${cal.steps[i].label}" done`}>
            ✓ Mark "{cal.steps[i].label}" done
          </button>
        )}
        <button className="btn" disabled={busy || saving || i === 0} onClick={() => save(reopenLast(cal))} aria-label="Reopen previous step">
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
