import { useState } from 'react';
import { enterPortal, portalByRating, portalCandidates, portalProblem, takeOutOfPortal } from '../../engine/college/portal';
import { formatShares } from '../../engine/college/recruiting';
import { collegeName, currentClassBoardSeason, recruitingWrites, schoolAbbr, schoolName, type RecruitingResult } from '../../engine/college/state';
import { groupLabel } from '../../engine/shared/leagues';
import { POSITIONS } from '../../engine/roster/rules';
import type { MetaFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { PageHeader } from '../components/PageHeader';
import { commitDocs, newBatchId } from '../roster/commit';
import { useRecruitingState } from './useRecruitingState';
import '../pages/roster.css';
import './college.css';
import '../offseason/offseason.css';
import { PlayerName } from '../components/PlayerName';

/**
 * The FBAJC transfer portal (/league/fbajc/portal): put returning players (So/Jr/Sr) in the portal, and take them back out.
 * The portal belongs to the board of the class that plays this season; the recruiting page's Board tab commits its players.
 */
export function PortalPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const load = useRecruitingState(n === undefined ? undefined : currentClassBoardSeason(n));
  const saving = useSaving();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [school, setSchool] = useState('');
  const [conference, setConference] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState('');

  const head = <PageHeader kicker="FBAJC" title="FBAJC transfer portal" />;
  if (meta.error) return <p className="error">Couldn't load the portal: {meta.error.message}</p>;
  if (load.error) return <p className="error">Couldn't load the portal: {load.error.message}</p>;
  if (n === undefined || (!load.state && !load.setup)) return <p className="muted">Loading…</p>;
  if (!load.state) return <section className="stack">{head}<div className="card"><p className="muted">{`The S${n} college rosters don't exist yet.`}</p></div></section>;

  const state = load.state;
  const closed = portalProblem(state.calendar);
  const off = closed !== null || saving;
  // Taking a player out follows the engine: open from Adjust Age on, until the fbajc step is done.
  const takeOutOff = state.calendar.steps.find(x => x.id === 'fbajc')?.done === true || saving;
  const name = (id: string) => collegeName(state.players, id);
  const group = (teamId: string) => state.teams.teams.find(t => t.teamId === teamId)?.group ?? '';
  const needle = search.trim().toLowerCase();
  const shown = portalCandidates(state).filter(c =>
    (!school || c.teamId === school)
    && (!conference || group(c.teamId) === conference)
    && (!position || c.position === position)
    && name(c.playerId).toLowerCase().includes(needle));
  const conferences = [...new Set(state.teams.teams.map(t => t.group ?? ''))].filter(Boolean).sort();
  const schools = [...state.teams.teams].sort((a, b) => a.name.localeCompare(b.name));
  const inPortal = portalByRating(state);

  const run = async (result: RecruitingResult) => {
    if (!result.ok) {
      setError(result.problems.join('; '));
      return;
    }
    setError('');
    try {
      await commitDocs(result.label, recruitingWrites(result), load.versions);
      setPicked(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const k = picked.size;

  return (
    <section className="stack">
      {head}
      <p className={closed ? 'muted' : 'card headed banner'}>{closed ?? `The S${n} transfer portal is open.`}</p>
      {error && <p className="error">{error}</p>}
      <div className="card">
      <h2>Put players in the portal</h2>
      <div className="chips">
        <input className="college-search" aria-label="Search names" placeholder="Search names" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="School" value={school} onChange={e => setSchool(e.target.value)}>
          <option value="">All schools</option>
          {schools.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
        </select>
        <select aria-label="Conference" value={conference} onChange={e => setConference(e.target.value)}>
          <option value="">All conferences</option>
          {conferences.map(g => <option key={g} value={g}>{groupLabel('fbajc', g)}</option>)}
        </select>
        <select aria-label="Position" value={position} onChange={e => setPosition(e.target.value)}>
          <option value="">All positions</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          type="button" className="btn primary" disabled={off || k === 0}
          onClick={() => run(enterPortal(state, [...picked], { batchId: newBatchId() }))}
        >
          {`Put ${k} ${k === 1 ? 'player' : 'players'} in the portal`}
        </button>
      </div>
      <div className="table-wrap tall">
        <table className="stat-table board-table" aria-label="Players who can enter the portal">
          <thead>
            <tr><th /><th>Name</th><th>School</th><th>Yr</th><th>Pos</th><th className="n">Rtg</th></tr>
          </thead>
          <tbody>
            {shown.map(c => (
              <tr key={c.playerId}>
                <td>
                  <input
                    type="checkbox" aria-label={`Select ${name(c.playerId)}`} disabled={off}
                    checked={picked.has(c.playerId)} onChange={() => toggle(c.playerId)}
                  />
                </td>
                <td><PlayerName id={c.playerId} name={name(c.playerId)} /></td>
                <td>{schoolName(state, c.teamId)}</td>
                <td>{c.classYear}</td>
                <td>{c.position}</td>
                <td className="n">{c.rating ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      <div className="card">
      <h2>In the portal · {inPortal.length}</h2>
      {inPortal.length === 0 ? <p className="muted">Nobody is in the portal.</p> : (
        <div className="table-wrap tall">
          <table className="stat-table board-table" aria-label="In the portal">
            <thead>
              <tr><th>Name</th><th>From</th><th>Pos</th><th>Yr</th><th className="n">Rtg</th><th>Projections</th><th><span className="muted">Actions</span></th></tr>
            </thead>
            <tbody>
              {inPortal.map(p => (
                <tr key={p.playerId}>
                  <td><PlayerName id={p.playerId} name={name(p.playerId)} /></td>
                  <td>{`from ${schoolName(state, p.fromTeam)}`}</td>
                  <td>{p.position}</td>
                  <td>{p.classYear}</td>
                  <td className="n">{p.rating ?? '—'}</td>
                  <td>
                    {p.committedTo
                      ? <strong>{`Committed: ${schoolName(state, p.committedTo)}`}</strong>
                      : Object.keys(p.projections).length === 0
                        ? <span className="muted">No projections</span>
                        : formatShares(p, id => schoolAbbr(state, id))}
                  </td>
                  <td className="actions">
                    {!p.committedTo && (
                      <button
                        type="button" className="btn" disabled={takeOutOff} aria-label={`Take out ${name(p.playerId)}`}
                        onClick={() => run(takeOutOfPortal(state, p.playerId, { batchId: newBatchId() }))}
                      >
                        Take out
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </section>
  );
}
