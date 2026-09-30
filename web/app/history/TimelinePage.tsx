import { Link } from 'react-router-dom';
import { buildTimeline } from '../../engine/history/timeline';
import type { EventsFile, MetaFile } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc, useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { SkippedWarning } from './PlayerLink';
import { TeamFull, useFbaTeams } from './useTeams';
import './history.css';

export function TimelinePage() {
  const { seasons, errors, error } = useHistory('fba');
  const events = useDoc<EventsFile>('leagues/fba/events.json');
  const meta = useDoc<MetaFile>('meta.json');
  const { settled, teams, franchises } = useFbaTeams();
  const failure = error ?? docFailure(events);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !settled || !docSettled(events) || !docSettled(meta)) return <p className="muted">Loading…</p>;
  const through = meta.data?.currentSeason ?? Infinity;
  const rows = buildTimeline(seasons, franchises, events.data ?? null).filter(r => r.season <= through);
  const hasSummary = new Set(seasons.map(s => s.season));
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="Timeline" />
      <SkippedWarning errors={errors} />
      {!events.data && <p className="muted">Run npm run import -- --events --data data for league notes and rule changes.</p>}
      <ol className="timeline">
        {rows.map(r => (
          <li key={r.season} className="timeline-row">
            {hasSummary.has(r.season)
              ? <Link className="timeline-season" to={`/history/fba/season/${r.season}`}>S{r.season}</Link>
              : <span className="timeline-season">S{r.season}</span>}
            <div className="timeline-body">
              {r.champion && (
                <div className="timeline-champ"><TeamFull teams={teams} franchises={franchises} teamId={r.champion.teamId} name={r.champion.name} season={r.season} /></div>
              )}
              {r.expansions.length > 0 && <div>New: {r.expansions.map(e => e.name).join(', ')}</div>}
              {r.renames.map(n => <div key={n.teamId}>{n.from} → {n.to}</div>)}
              {r.notes.map((n, i) => <div key={i} className="muted">{n}</div>)}
              {r.rules.length > 0 && (
                <div>
                  <b>Rule changes</b>
                  <ul>{r.rules.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {events.data && events.data.before.length > 0 && (
        <div>
          <h2 className="section-title">Before the FBA</h2>
          <ul>{events.data.before.map(b => <li key={b.label}>{b.label}: {b.notes.join(' ')}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
