import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nextSeasonDocs, nextSeasonPaths, type NextSeasonInput } from '../../engine/season/nextSeason';
import { groupLabel } from '../../engine/shared/leagues';
import type {
  CalendarFile, D2DraftFile, D2PoolFile, RankingFile, FreeAgentsFile, MetaFile, RecruitingFile, ReservesFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, useSaving, type DocState, type Versions } from '../api';
import { PageHeader } from '../components/PageHeader';
import { commitDocs, newBatchId } from '../roster/commit';
import './pages.css';

/** "Go to next season": the confirm card, then one batch that starts S{n+1} and clears Undo. */
export function NextSeasonPage() {
  const navigate = useNavigate();
  const saving = useSaving();
  const started = useRef(false);
  const [saveError, setSaveError] = useState('');
  const calendar = useDoc<CalendarFile>('calendar.json');
  const n = calendar.data?.season;
  const p = n === undefined ? null : nextSeasonPaths(n);
  const meta = useDoc<MetaFile>('meta.json');
  const d2Teams = useDoc<TeamsFile>(p && p.d2Teams);
  const fbaRosters = useDoc<RostersFile>(p && p.fba.rosters);
  const fbaFreeAgents = useDoc<FreeAgentsFile>(p && p.fba.freeAgents);
  const fbaTx = useDoc<TransactionsFile>(p && p.fba.tx);
  const fbaSummary = useDoc<SummaryFile>(p && p.fba.summary);
  const d2Rosters = useDoc<RostersFile>(p && p.fbad2.rosters);
  const d2Reserves = useDoc<ReservesFile>(p && p.fbad2.reserves);
  const d2Tx = useDoc<TransactionsFile>(p && p.fbad2.tx);
  const d2Ratings = useDoc<RankingFile>(p && p.fbad2.ratings);
  const d2Pool = useDoc<D2PoolFile>(p && p.fbad2.pool);
  const d2Draft = useDoc<D2DraftFile>(p && p.fbad2.draft);
  const d2Summary = useDoc<SummaryFile>(p && p.fbad2.summary);
  const recruiting = useDoc<RecruitingFile>(p && p.fbajc.recruiting);
  const collegeRosters = useDoc<RostersFile>(p && p.fbajc.rosters);
  const nextFbaRosters = useDoc<RostersFile>(p && p.next.fbaRosters);
  const nextFbaFreeAgents = useDoc<FreeAgentsFile>(p && p.next.fbaFreeAgents);
  const nextFbaTx = useDoc<TransactionsFile>(p && p.next.fbaTx);
  const nextD2Rosters = useDoc<RostersFile>(p && p.next.d2Rosters);
  const nextD2Reserves = useDoc<ReservesFile>(p && p.next.d2Reserves);
  const nextD2Tx = useDoc<TransactionsFile>(p && p.next.d2Tx);

  if (calendar.error) return <p className="error">Couldn't load the calendar: {calendar.error.message}</p>;
  if (!p || n === undefined) return <p className="muted">Loading…</p>;
  const all: [string, DocState<unknown>][] = [
    [p.calendar, calendar], [p.meta, meta], [p.d2Teams, d2Teams],
    [p.fba.rosters, fbaRosters], [p.fba.freeAgents, fbaFreeAgents], [p.fba.tx, fbaTx], [p.fba.summary, fbaSummary],
    [p.fbad2.rosters, d2Rosters], [p.fbad2.reserves, d2Reserves], [p.fbad2.tx, d2Tx],
    [p.fbad2.ratings, d2Ratings], [p.fbad2.pool, d2Pool], [p.fbad2.draft, d2Draft], [p.fbad2.summary, d2Summary],
    [p.fbajc.recruiting, recruiting], [p.fbajc.rosters, collegeRosters],
    [p.next.fbaRosters, nextFbaRosters], [p.next.fbaFreeAgents, nextFbaFreeAgents], [p.next.fbaTx, nextFbaTx],
    [p.next.d2Rosters, nextD2Rosters], [p.next.d2Reserves, nextD2Reserves], [p.next.d2Tx, nextD2Tx],
  ];
  const required: DocState<unknown>[] = [meta, d2Teams, fbaRosters, fbaTx, d2Rosters, d2Tx];
  const failed = all.find(([, d]) => d.error && !d.missing)?.[1].error ?? required.find(d => d.missing)?.error;
  if (failed) return <p className="error">Couldn't load the season: {failed.message}</p>;
  if (all.some(([, d]) => !d.data && !d.missing)) return <p className="muted">Loading…</p>;

  const versions: Versions = Object.fromEntries(all.map(([path, d]) => [path, d.version]));
  const input: NextSeasonInput = {
    calendar: calendar.data!,
    meta: meta.data!,
    d2Teams: d2Teams.data!,
    fba: { rosters: fbaRosters.data!, freeAgents: fbaFreeAgents.data ?? null, tx: fbaTx.data!, summary: fbaSummary.data ?? null },
    fbad2: {
      rosters: d2Rosters.data!, reserves: d2Reserves.data ?? null, tx: d2Tx.data!,
      ratings: d2Ratings.data ?? null, pool: d2Pool.data ?? null, draft: d2Draft.data ?? null, summary: d2Summary.data ?? null,
    },
    fbajc: { recruiting: recruiting.data ?? null, rosters: collegeRosters.data ?? null },
    nextStarted: Boolean(nextFbaRosters.data || nextD2Rosters.data),
  };
  const preview = nextSeasonDocs(input, { batchId: 'preview' });
  const teamName = (id: string) => d2Teams.data!.teams.find(t => t.teamId === id)?.name ?? id;

  const start = async () => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setSaveError('');
    const r = nextSeasonDocs(input, { batchId: newBatchId() });
    if (!r.ok) {
      started.current = false;
      return;
    }
    try {
      await commitDocs(r.label, r.writes, versions, { resetUndo: true });
      navigate('/');
    } catch (e) {
      setSaveError((e as Error).message);
      started.current = false;
    }
  };

  return (
    <section>
      <PageHeader kicker={`Season ${n}`} title="Go to next season" />
      {!preview.ok ? (
        <div className="card">
          <h3>S{n} isn't finished yet</h3>
          <ul>{preview.problems.map(x => <li key={x}>{x}</li>)}</ul>
          <Link to="/calendar">Calendar ▸</Link>
        </div>
      ) : (
        <div className="card">
          <h3>Start S{n + 1}</h3>
          <ul>
            <li>Locks the S{n} FBA and D2 rosters, free agents, reserves and transactions, and the recruiting board.</li>
            <li>Creates the S{n + 1} FBA and D2 rosters from the final S{n} rosters, with points reset to 0. Contracts are unchanged.</li>
            <li>Starts S{n + 1} with an empty FBA free-agent list and the S{n} D2 reserves.</li>
            <li>Resets the calendar to S{n + 1} · Adjust Age.</li>
            <li>Undo history will be cleared.</li>
          </ul>
          <h3>D2 promotion and relegation</h3>
          {preview.moves.length ? (
            <ul>
              {preview.moves.map(m => <li key={m.teamId}>{teamName(m.teamId)}: {groupLabel('fbad2', m.from)} → {groupLabel('fbad2', m.to)}</li>)}
            </ul>
          ) : <p className="muted">No teams change leagues.</p>}
          {saveError ? (
            <p className="error">
              Save failed: {saveError} <button className="btn" disabled={saving} onClick={start}>Retry</button>
            </p>
          ) : (
            <button className="btn primary" disabled={saving} onClick={start}>Start S{n + 1}</button>
          )}
        </div>
      )}
    </section>
  );
}
