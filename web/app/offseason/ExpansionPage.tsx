import { useRef, useState, type ReactNode } from 'react';
import {
  exposedPlayers, expansionPick, finishExpansion, lockProtections, onTheClock, pickProblems, setProtections, startExpansion,
  type ExpansionState,
} from '../../engine/offseason/expansion';
import { addExpansionTeams } from '../../engine/season/addExpansionTeams';
import type { WritesResult } from '../../engine/season/moves';
import { EXPANSION_TEAMS, MAX_PROTECTED } from '../../engine/shared/expansion';
import { teamsJoining } from '../../engine/shared/teams';
import { useSaving } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { PlayerName } from '../components/PlayerName';
import { TeamName } from '../components/TeamName';
import { commitDocs, newBatchId } from '../roster/commit';
import { useExpansionState } from './useExpansionState';
import './offseason.css';

const conference = (g: string | null) => (g === 'E' ? 'East' : g === 'W' ? 'West' : g ?? '');
const contract = (amount: number | null | undefined, end: number | null | undefined) =>
  amount === null || amount === undefined ? '—' : `$${amount}${end === null || end === undefined ? '' : ` through S${end}`}`;
const ctxOf = () => ({ batchId: newBatchId() });
const PREVIEW = { batchId: 'preview' };

interface Helpers {
  teamCell: (id: string) => ReactNode;
  playerName: (id: string) => string;
}
type Run = (make: () => WritesResult) => void;

/** The expansion (/league/fba/expansion): add the new teams, set protections, then the expansion draft. */
export function ExpansionPage() {
  const { addState, draftState, versions, mode, ready, error } = useExpansionState();
  const saving = useSaving();
  const busy = useRef(false);
  const [actionError, setActionError] = useState('');
  const [teamId, setTeamId] = useState('');

  if (error) return <p className="error">Couldn't load the expansion: {error.message}</p>;
  if (!ready) return <p className="muted">Loading…</p>;

  /** One action = one commitDocs call; the ref stops a double click from saving twice. */
  const run: Run = async make => {
    if (busy.current) return;
    busy.current = true;
    setActionError('');
    try {
      const r = make();
      if (!r.ok) {
        setActionError(r.problems.join('; '));
        return;
      }
      await commitDocs(r.label, r.writes, versions);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      busy.current = false;
    }
  };
  const header = <PageHeader kicker="Offseason" title="Expansion" />;
  const err = actionError && <p className="error">{actionError}</p>;

  if (mode === 'add' && addState) {
    const preview = addExpansionTeams(addState, PREVIEW);
    return (
      <section className="stack">
        {header}
        <div className="card">
          <h2>New teams</h2>
          <ul className="plain">
            {EXPANSION_TEAMS.map(t => (
              <li key={t.teamId}><TeamName team={t} season={addState.season + 1} /> <span className="muted">{conference(t.group)}</span></li>
            ))}
          </ul>
        </div>
        <div className="card toolbar">
          <button className="btn primary" disabled={saving || !preview.ok} onClick={() => run(() => addExpansionTeams(addState, ctxOf()))}>Add teams</button>
          {!preview.ok && <span className="muted">{preview.problems.join('; ')}</span>}
        </div>
        {err}
      </section>
    );
  }

  if (mode !== 'draft' || !draftState) {
    return <section className="stack">{header}<p className="muted">No expansion this season</p></section>;
  }

  const s = draftState;
  const h: Helpers = {
    teamCell: id => {
      const t = s.teams.teams.find(x => x.teamId === id);
      return t ? <TeamName team={t} season={s.season} /> : id;
    },
    playerName: id => s.players.players[id]?.name ?? id,
  };
  const file = s.expansion;
  let body: ReactNode;
  if (!file) {
    body = (
      <div className="card toolbar">
        <button className="btn primary" disabled={saving} onClick={() => run(() => startExpansion(s, ctxOf()))}>Start expansion draft</button>
      </div>
    );
  } else if (file.phase === 'protect') {
    body = <Protect s={s} h={h} saving={saving} run={run} teamId={teamId} setTeamId={setTeamId} />;
  } else if (file.phase === 'draft') {
    body = <Draft s={s} h={h} saving={saving} run={run} />;
  } else {
    body = (
      <div className="card">
        <h2>Expansion draft picks</h2>
        <div className="table-wrap"><table className="stat-table">
          <thead><tr><th className="rank">Pick</th><th>Team</th><th>Player</th><th>Pos</th><th>From</th><th>Contract</th></tr></thead>
          <tbody>
            {file.picks.map(p => {
              const e = s.fba.teams[p.teamId]?.find(x => x.playerId === p.playerId);
              return (
                <tr key={p.n}>
                  <td className="rank">{p.n}</td><td>{h.teamCell(p.teamId)}</td>
                  <td><PlayerName id={p.playerId} name={h.playerName(p.playerId)} /></td><td>{p.position}</td>
                  <td>{h.teamCell(p.fromTeamId)}</td><td>{contract(e?.contractAmount, e?.contractEnd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    );
  }
  return <section className="stack">{header}{body}{err}</section>;
}

function Protect({ s, h, saving, run, teamId, setTeamId }: {
  s: ExpansionState; h: Helpers; saving: boolean; run: Run; teamId: string; setTeamId: (id: string) => void;
}) {
  const f = s.expansion!;
  const joining = new Set(teamsJoining(s.teams, s.season).map(t => t.teamId));
  const existing = s.teams.teams.filter(t => !joining.has(t.teamId) && s.fba.teams[t.teamId]);
  const selected = existing.find(t => t.teamId === teamId) ?? existing[0];
  const protectedIds = selected ? f.protections[selected.teamId] ?? [] : [];
  const exposed = exposedPlayers(s);
  const donors = new Set(exposed.map(e => e.teamId)).size;
  const lock = lockProtections(s, PREVIEW);
  const toggle = (playerId: string, on: boolean) => run(() => setProtections(
    s, selected.teamId, on ? [...protectedIds, playerId] : protectedIds.filter(id => id !== playerId), ctxOf(),
  ));
  return (
    <>
      <div className="card">
        <h2>Protections</h2>
        <p className="toolbar">
          <label>Team{' '}
            <select value={selected?.teamId ?? ''} onChange={e => setTeamId(e.target.value)} aria-label="Team">
              {existing.map(t => <option key={t.teamId} value={t.teamId}>{t.name} ({(f.protections[t.teamId] ?? []).length}/{MAX_PROTECTED})</option>)}
            </select>
          </label>
        </p>
        {selected && (
          <div className="table-wrap"><table className="stat-table" aria-label="Roster">
            <thead><tr><th>Protect</th><th>Player</th><th>Pos</th><th className="num">Rating</th><th className="num">Age</th><th>Contract</th></tr></thead>
            <tbody>
              {(s.fba.teams[selected.teamId] ?? []).filter(e => e.playerId !== null).map(e => {
                const id = e.playerId!;
                const on = protectedIds.includes(id);
                return (
                  <tr key={id}>
                    <td>
                      {e.restricted === true
                        ? <Badge kind="clinched">Protected (restricted)</Badge>
                        : <input type="checkbox" aria-label={`Protect ${h.playerName(id)}`} checked={on}
                            disabled={saving || (!on && protectedIds.length >= MAX_PROTECTED)} onChange={ev => toggle(id, ev.target.checked)} />}
                    </td>
                    <td><PlayerName id={id} name={h.playerName(id)} /></td><td>{e.position}</td>
                    <td className="num">{e.rating ?? '—'}</td><td className="num">{e.age ?? '—'}</td>
                    <td>{contract(e.contractAmount, e.contractEnd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      <div className="card toolbar">
        <p>{exposed.length} players exposed from {donors} teams; the draft needs {f.order.length} picks</p>
        <button className="btn primary" disabled={saving || !lock.ok} onClick={() => run(() => lockProtections(s, ctxOf()))}>Lock protections</button>
        {!lock.ok && <span className="muted">{lock.problems.join('; ')}</span>}
      </div>
    </>
  );
}

function Draft({ s, h, saving, run }: { s: ExpansionState; h: Helpers; saving: boolean; run: Run }) {
  const f = s.expansion!;
  const clock = onTheClock(f);
  const exposed = exposedPlayers(s);
  return (
    <>
      <div className="card clock-card">
        {clock === null
          ? <p>All {f.order.length} picks are made.</p>
          : <p>On the clock: pick {f.picks.length + 1}, {h.teamCell(clock)}</p>}
      </div>
      <div className="card">
        <h2>Order</h2>
        <ol className="order-list" aria-label="Pick order">
          {f.order.map((id, i) => {
            const pick = f.picks[i];
            return (
              <li key={i} className={i === f.picks.length ? 'now' : pick ? 'done' : ''}>
                <strong className="order-num">{i + 1}</strong>
                <span>
                  {h.teamCell(id)}
                  {pick && <> selects <PlayerName id={pick.playerId} name={h.playerName(pick.playerId)} /> ({pick.position}, from {s.teams.teams.find(t => t.teamId === pick.fromTeamId)?.name ?? pick.fromTeamId})</>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {clock === null ? (
        <div className="card toolbar">
          <button className="btn primary" disabled={saving} onClick={() => run(() => finishExpansion(s, ctxOf()))}>Finish expansion draft</button>
        </div>
      ) : (
        <div className="card">
          <h2>Available players</h2>
          <div className="table-wrap tall"><table className="stat-table" aria-label="Exposed players">
            <thead><tr><th>Player</th><th>Pos</th><th className="num">Rating</th><th className="num">Age</th><th>Contract</th><th>From</th><th /></tr></thead>
            <tbody>
              {exposed.map(e => {
                const problems = pickProblems(s, e.playerId).join('; ');
                return (
                  <tr key={e.playerId}>
                    <td><PlayerName id={e.playerId} name={h.playerName(e.playerId)} /></td><td>{e.position}</td>
                    <td className="num">{e.rating ?? '—'}</td><td className="num">{e.age ?? '—'}</td>
                    <td>{contract(e.contractAmount, e.contractEnd)}</td><td>{h.teamCell(e.teamId)}</td>
                    <td>
                      <button className="btn" aria-label={`Take ${h.playerName(e.playerId)}`} title={problems || undefined}
                        disabled={saving || Boolean(problems)} onClick={() => run(() => expansionPick(s, e.playerId, ctxOf()))}>Take</button>
                      {problems && <span className="muted"> {problems}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}
