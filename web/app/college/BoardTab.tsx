import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addProjection, commit, commitPreview, decommit, projectionShares, removeProjection, uncommitted,
} from '../../engine/college/recruiting';
import { collegeName, playsThisSeason, schoolAbbr, schoolName, type RecruitingResult, type RecruitingState } from '../../engine/college/state';
import { fillWalkOns, openSpots, walkOnProblem } from '../../engine/college/walkOns';
import type { Rng } from '../../engine/d2/random';
import { groupLabel } from '../../engine/shared/leagues';
import { POSITIONS } from '../../engine/roster/rules';
import type { PortalPlayer, Position, Prospect, Team } from '../../engine/shared/types';
import { newBatchId } from '../roster/commit';
import '../pages/roster.css';
import './college.css';
import '../offseason/offseason.css';

type Status = 'all' | 'open' | 'committed';
type Picking = { playerId: string; mode: 'project' | 'commit' };

const STATUS: [Status, string][] = [['all', 'Everyone'], ['open', 'Uncommitted'], ['committed', 'Committed']];

interface Props {
  state: RecruitingState;
  saving: boolean;
  onRun: (result: RecruitingResult) => void;
  /** Random source for walk-on ratings; pages use Math.random. */
  rng?: Rng;
}

/** The recruiting board: the class and the transfer portal, with projections, commits and decommits. */
export function BoardTab({ state, saving, onRun, rng = Math.random }: Props) {
  const [pos, setPos] = useState<'ALL' | Position>('ALL');
  const [status, setStatus] = useState<Status>('all');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<Picking | null>(null);
  const doc = state.recruiting;
  if (!doc.created && doc.portal.length === 0) {
    // The current class is board-only (no Class tab), so it cannot be created from here.
    if (playsThisSeason(state)) return <p className="muted">The S{doc.classOf} class board doesn't exist yet. Import it, or create it in the previous season.</p>;
    return (
      <p className="muted">
        Create the S{doc.classOf} class first. <Link to={`/league/fbajc/recruiting?class=${doc.classOf}&tab=class`}>Go to the class ▸</Link>
      </p>
    );
  }
  const locked = doc.locked;
  const name = (id: string) => collegeName(state.players, id);
  const open = uncommitted(doc);
  const needle = search.trim().toLowerCase();
  const shown = (p: Prospect) =>
    (pos === 'ALL' || p.position === pos)
    && (status === 'all' || (status === 'committed') === (p.committedTo !== null))
    && name(p.playerId).toLowerCase().includes(needle);
  const run = (result: RecruitingResult) => {
    setPicking(null);
    onRun(result);
  };
  const spots = openSpots(state.rosters);
  const walkOnBlock = playsThisSeason(state)
    ? {
      problem: locked ? walkOnProblem(state) ?? 'The board is locked' : walkOnProblem(state),
      label: spots === 0 ? 'Fill open spots with walk-ons' : `Fill ${spots} open ${spots === 1 ? 'spot' : 'spots'} with walk-ons`,
    }
    : null;
  const picked = picking ? [...doc.recruits, ...doc.portal].find(p => p.playerId === picking.playerId) ?? null : null;

  // A player's rank is his place in his group (the class or the portal), so it stays the same while the filters narrow the list.
  const rankOf = new Map<string, number>([...doc.recruits, ...doc.portal].map(p => [p.playerId, 0]));
  doc.recruits.forEach((p, i) => rankOf.set(p.playerId, i + 1));
  doc.portal.forEach((p, i) => rankOf.set(p.playerId, i + 1));
  const row = (p: Prospect | PortalPlayer) => (
    <tr key={p.playerId}>
      <td className="n">{rankOf.get(p.playerId)}</td>
      <td>{name(p.playerId)}</td>
      <td>{p.position}</td>
      <td>{p.classYear}</td>
      <td>{p.stars !== null ? `${p.stars}★` : '—'}</td>
      <td className="n">{p.rating ?? '—'}</td>
      {'fromTeam' in p && <td>{schoolName(state, p.fromTeam)}</td>}
      <td>
        {p.committedTo ? <strong>{`Committed: ${schoolName(state, p.committedTo)}`}</strong> : (
          <span className="shares">
            {projectionShares(p).map(s => (
              <span key={s.teamId} className="tag">
                {`${s.pct}% ${schoolAbbr(state, s.teamId)}`}
                {!locked && (
                  <button
                    type="button" className="tag-x" disabled={saving}
                    aria-label={`Remove a ${schoolAbbr(state, s.teamId)} projection for ${name(p.playerId)}`}
                    onClick={() => run(removeProjection(state, p.playerId, s.teamId))}
                  >
                    −
                  </button>
                )}
              </span>
            ))}
            {Object.keys(p.projections).length === 0 && <span className="muted">No projections</span>}
          </span>
        )}
      </td>
      <td className="actions">
        {!locked && !p.committedTo && (
          <>
            <button type="button" className="btn" disabled={saving} aria-label={`Add a projection for ${name(p.playerId)}`}
              onClick={() => setPicking({ playerId: p.playerId, mode: 'project' })}>+</button>{' '}
            <button type="button" className="btn" disabled={saving} aria-label={`Commit ${name(p.playerId)}`}
              onClick={() => setPicking({ playerId: p.playerId, mode: 'commit' })}>Commit</button>
          </>
        )}
        {!locked && p.committedTo && (
          <button type="button" className="btn" disabled={saving} aria-label={`Decommit ${name(p.playerId)}`}
            onClick={() => run(decommit(state, p.playerId, { batchId: newBatchId() }))}>Decommit</button>
        )}
      </td>
    </tr>
  );

  const head = (portal: boolean) => (
    <thead>
      <tr>
        <th className="n">#</th><th>Name</th><th>Pos</th><th>Yr</th><th>Stars</th><th className="n">Rtg</th>{portal && <th>From</th>}<th>Projections</th>
        <th><span className="muted">Actions</span></th>
      </tr>
    </thead>
  );

  return (
    <div className="stack">
      <p className="muted">{`${doc.recruits.length - open.recruits.length} of ${doc.recruits.length} committed · ${open.portal.length} in the portal`}</p>
      {walkOnBlock && (
        <div className="walk-ons card toolbar">
          <button
            type="button" className="btn primary" disabled={saving || walkOnBlock.problem !== null}
            onClick={() => run(fillWalkOns(state, rng, { batchId: newBatchId() }))}
          >
            {walkOnBlock.label}
          </button>
          {walkOnBlock.problem && <p className="muted">{walkOnBlock.problem}</p>}
        </div>
      )}
      <div className="card filters">
      <div className="chips" role="group" aria-label="Position filter">
        {(['ALL', ...POSITIONS] as ('ALL' | Position)[]).map(p => (
          <button key={p} type="button" className={`chip${pos === p ? ' on' : ''}`} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === 'ALL' ? 'All' : p}</button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Commitment filter">
        {STATUS.map(([s, label]) => (
          <button key={s} type="button" className={`chip${status === s ? ' on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{label}</button>
        ))}
        <input className="college-search" aria-label="Search names" placeholder="Search names" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      </div>
      {picking && picked && (
        <SchoolPicker
          state={state} prospect={picked} mode={picking.mode} saving={saving} onClose={() => setPicking(null)}
          onPick={teamId => run(picking.mode === 'project'
            ? addProjection(state, picked.playerId, teamId)
            : commit(state, picked.playerId, teamId, { batchId: newBatchId() }))}
        />
      )}
      <div className="card">
      <h2>Class of S{doc.classOf} · {doc.recruits.length}</h2>
      <div className="table-wrap tall">
        <table className="stat-table board-table" aria-label={`Class of S${doc.classOf}`}>
          {head(false)}
          <tbody>{doc.recruits.filter(shown).map(row)}</tbody>
        </table>
      </div>
      </div>
      <div className="card">
      <h2>Transfer portal · {doc.portal.length}</h2>
      {doc.portal.length === 0 ? <p className="muted">Nobody is in the portal.</p> : (
        <div className="table-wrap tall">
          <table className="stat-table board-table" aria-label="Transfer portal">
            {head(true)}
            <tbody>{doc.portal.filter(shown).map(row)}</tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

/** Picks a school: every school by conference (projected schools first when committing). Committing shows who holds the spot first. */
function SchoolPicker({ state, prospect, mode, saving, onPick, onClose }: {
  state: RecruitingState; prospect: Prospect; mode: 'project' | 'commit'; saving: boolean;
  onPick: (teamId: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const who = collegeName(state.players, prospect.playerId);
  const needle = query.trim().toLowerCase();
  const projected = new Set(Object.keys(prospect.projections));
  const first: Team[] = [];
  const groups = new Map<string, Team[]>();
  for (const t of state.teams.teams) {
    if (!`${t.name} ${t.abbr}`.toLowerCase().includes(needle)) continue;
    if (mode === 'commit' && projected.has(t.teamId)) first.push(t);
    else groups.set(t.group ?? '', [...(groups.get(t.group ?? '') ?? []), t]);
  }
  const byName = (a: Team, b: Team) => a.name.localeCompare(b.name);
  const preview = mode === 'commit' && chosen ? commitPreview(state, prospect.playerId, chosen) : null;
  const schoolButton = (t: Team) => (
    <button
      key={t.teamId} type="button" className={`chip${chosen === t.teamId ? ' on' : ''}`} disabled={saving}
      onClick={() => (mode === 'project' ? onPick(t.teamId) : setChosen(t.teamId))}
    >
      {t.name}
    </button>
  );
  return (
    <div className="card picker" role="dialog" aria-label={`${mode === 'project' ? 'Project' : 'Commit'} ${who}`}>
      <div className="toolbar">
        <h3>{mode === 'project' ? 'Add a projection' : 'Commit'} · {who}</h3>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
      <input className="college-search" aria-label="Search schools" placeholder="Search schools" value={query} onChange={e => setQuery(e.target.value)} />
      {first.length > 0 && (
        <>
          <h4>Projected</h4>
          <div className="chips">{[...first].sort(byName).map(schoolButton)}</div>
        </>
      )}
      {[...groups.entries()].map(([group, list]) => (
        <div key={group}>
          <h4>{groupLabel('fbajc', group || null)}</h4>
          <div className="chips">{[...list].sort(byName).map(schoolButton)}</div>
        </div>
      ))}
      {preview && (
        <div className="picker-preview">
          <span className={preview.ok ? undefined : 'error'}>{preview.text}</span>
          <button type="button" className="btn primary" disabled={!preview.ok || saving} onClick={() => onPick(chosen!)}>Confirm commit</button>
        </div>
      )}
    </div>
  );
}
