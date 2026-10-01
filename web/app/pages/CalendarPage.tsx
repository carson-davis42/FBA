import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fbajcGateProblem } from '../../engine/college/recruiting';
import { boardPath } from '../../engine/college/state';
import { CALENDAR_STEP } from '../../engine/season/state';
import { currentStepIndex, markCurrentDone, reopenLast, reopenProblem } from '../../engine/shared/calendar';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile, CalendarStep, RecruitingFile, RostersFile, SummaryFile } from '../../engine/shared/types';
import { putDoc, useDoc, useSaving } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { PortalBanner } from '../components/PortalBanner';
import { toolTarget } from '../stepRoutes';
import './pages.css';

/** Consecutive steps with the same kind and league form one phase. */
function phases(steps: CalendarStep[]): { key: string; title: string; from: number; steps: CalendarStep[] }[] {
  const out: { key: string; title: string; from: number; steps: CalendarStep[] }[] = [];
  steps.forEach((s, j) => {
    const key = `${s.kind}:${s.league ?? ''}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.steps.push(s);
    else out.push({ key, title: s.kind === 'league' && s.league ? LEAGUE_LABEL[s.league] : 'Offseason', from: j, steps: [s] });
  });
  return out;
}

export function CalendarPage() {
  const { data: cal, version, error } = useDoc<CalendarFile>('calendar.json');
  const fbaSummary = useDoc<SummaryFile>(cal ? `leagues/fba/S${cal.season}/summary.json` : null);
  const d2Summary = useDoc<SummaryFile>(cal ? `leagues/fbad2/S${cal.season}/summary.json` : null);
  const jcSummary = useDoc<SummaryFile>(cal ? `leagues/fbajc/S${cal.season}/summary.json` : null);
  const recruiting = useDoc<RecruitingFile>(cal ? boardPath(cal.season - 1) : null);
  const collegeRosters = useDoc<RostersFile>(cal ? `leagues/fbajc/S${cal.season}/rosters.json` : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useSaving();
  if (error) return <p className="error">Couldn't load the calendar: {error.message}</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const i = currentStepIndex(cal);
  const tool = i >= 0 ? toolTarget(cal.steps[i]) : null;
  // The FBAJC step waits until every recruit and portal player of the class playing this season has committed
  // and no college roster has an open spot (a missing board or rosters doc means no gate).
  const atFbajc = i >= 0 && cal.steps[i].id === 'fbajc';
  const known = (d: { data?: unknown; missing?: boolean }) => Boolean(d.data || d.missing);
  const gate = !atFbajc ? null
    : recruiting.error && !recruiting.missing ? `Couldn't check recruiting: ${recruiting.error.message}`
    : collegeRosters.error && !collegeRosters.missing ? `Couldn't check recruiting: ${collegeRosters.error.message}`
    : !known(recruiting) || !known(collegeRosters) ? 'Checking recruiting…'
    : fbajcGateProblem(recruiting.data ?? null, collegeRosters.data ?? null);
  const finished = new Set<string>();
  if (fbaSummary.data?.locked) finished.add(CALENDAR_STEP.fba);
  if (d2Summary.data?.locked) finished.add(CALENDAR_STEP.fbad2);
  if (jcSummary.data?.locked) finished.add('fbajc');
  const reopenWhy = reopenProblem(cal, finished);
  // Reopen stays off until the three summaries are known (loaded, or confirmed missing with a 404).
  const summaries = [fbaSummary, d2Summary, jcSummary];
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
      <PageHeader kicker="Calendar" title={`Season ${cal.season} calendar`} />
      <PortalBanner />
      <div className="cal-actions">
        {tool && (
          <Link className="btn primary" to={tool}>Open {cal.steps[i].label} ▸</Link>
        )}
        {i >= 0 && !tool && (
          <button className="btn primary" disabled={busy || saving || gate !== null} onClick={() => save(markCurrentDone(cal))} aria-label={`Mark "${cal.steps[i].label}" done`}>
            ✓ Mark "{cal.steps[i].label}" done
          </button>
        )}
        {gate && <span className="muted">{gate}</span>}
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
      <div className="stack">
        {phases(cal.steps).map(g => (
          <div className="card" key={g.from}>
            <div className="card-head"><h2>{g.title}</h2></div>
            <ol className="steps">
              {g.steps.map((s, k) => {
                const j = g.from + k;
                return (
                  <li key={s.id} aria-current={j === i ? 'step' : undefined} className={[s.sub ? 'sub' : '', s.done ? 'done' : '', j === i ? 'current' : ''].join(' ')}>
                    <span className="mark">{s.done ? '✓' : j === i ? '▶' : '•'}</span>
                    <span>{s.label}</span>
                    {s.done ? <Badge kind="done">Done</Badge> : j === i ? <Badge kind="current">Current</Badge> : null}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
