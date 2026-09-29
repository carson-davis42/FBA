import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CALENDAR_STEP } from '../../engine/season/state';
import { currentStepIndex, markCurrentDone, reopenLast, reopenProblem } from '../../engine/shared/calendar';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile, SummaryFile } from '../../engine/shared/types';
import { putDoc, useDoc, useSaving } from '../api';
import { toolTarget } from '../stepRoutes';
import './pages.css';

export function CalendarPage() {
  const { data: cal, version, error } = useDoc<CalendarFile>('calendar.json');
  const fbaSummary = useDoc<SummaryFile>(cal ? `leagues/fba/S${cal.season}/summary.json` : null);
  const d2Summary = useDoc<SummaryFile>(cal ? `leagues/fbad2/S${cal.season}/summary.json` : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useSaving();
  if (error) return <p className="error">Couldn't load the calendar: {error.message}</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const i = currentStepIndex(cal);
  const tool = i >= 0 ? toolTarget(cal.steps[i]) : null;
  const finished = new Set<string>();
  if (fbaSummary.data?.locked) finished.add(CALENDAR_STEP.fba);
  if (d2Summary.data?.locked) finished.add(CALENDAR_STEP.fbad2);
  const reopenWhy = reopenProblem(cal, finished);
  // Reopen stays off until both summaries are known (loaded, or confirmed missing with a 404).
  const summaries = [fbaSummary, d2Summary];
  const summariesKnown = summaries.every(d => d.data || d.missing);
  const summaryError = summaries.find(d => d.error && !d.missing)?.error;
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
        {i < 0 && <Link className="btn primary" to="/next-season">Go to next season ▸</Link>}
        <button
          className="btn"
          disabled={busy || saving || i === 0 || !summariesKnown || reopenWhy !== null}
          title={reopenWhy ?? undefined}
          onClick={() => save(reopenLast(cal))}
          aria-label="Reopen previous step"
        >
          ↺ Reopen previous step
        </button>
        {reopenWhy && <span className="muted">{reopenWhy}</span>}
        {summaryError && <span className="error">Couldn't check whether S{cal.season} is finished: {summaryError.message}</span>}
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
