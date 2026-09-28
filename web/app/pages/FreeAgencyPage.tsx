import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { marketRows, type MarketType, openPositions } from '../../engine/roster/market';
import { closeFreeAgency, freeAgencyBlockers } from '../../engine/roster/moves';
import { payroll, POSITIONS } from '../../engine/roster/rules';
import { currentStepIndex, markCurrentDone } from '../../engine/shared/calendar';
import type { CalendarFile, Position, TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { PayrollBar } from '../components/PayrollBar';
import { RosterTable } from '../components/RosterTable';
import { SignPanel } from '../components/SignPanel';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import { useSeasonPhase } from '../season/useSeasonPhase';
import './roster.css';

const TYPES: MarketType[] = ['FA', 'Rookie', 'D2', 'Expired'];

export function FreeAgencyPage() {
  const { league = '' } = useParams();
  const { state, versions, error } = useRosterState();
  const phase = useSeasonPhase();
  const { data: teams } = useDoc<TeamsFile>('leagues/fba/teams.json');
  const { data: cal, version: calVersion } = useDoc<CalendarFile>('calendar.json');
  const [pos, setPos] = useState<Position | 'ALL'>('ALL');
  const [type, setType] = useState<MarketType | 'ALL'>('ALL');
  const [teamId, setTeamId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [closeError, setCloseError] = useState('');
  const saving = useSaving();

  if (league !== 'fba') return <p className="error">Free agency is only for the FBA.</p>;
  if (error) return <p className="error">Couldn't load rosters: {error.message}</p>;
  if (!state || !teams || !cal) return <p className="muted">Loading…</p>;

  const team = teamId ? state.fba.teams[teamId] : undefined;
  const needs = team ? openPositions(team) : [];
  const rows = marketRows(state).filter(r =>
    (pos === 'ALL' || r.position === pos) && (type === 'ALL' || r.type === type) && (!team || needs.length === 0 || needs.includes(r.position)),
  );
  const blockers = freeAgencyBlockers(state);
  const closed = state.freeAgents.locked;

  const close = async () => {
    const result = closeFreeAgency(state, { batchId: newBatchId() });
    if (!result.ok) return;
    const i = currentStepIndex(cal);
    const extra = i >= 0 && cal.steps[i].id === 'free-agency-offseason' ? [{ path: 'calendar.json', doc: markCurrentDone(cal) }] : [];
    try {
      await commitMove(result, { ...versions, 'calendar.json': calVersion }, extra);
    } catch (e) {
      setCloseError((e as Error).message);
    }
  };

  return (
    <section>
      <h1>S{state.season} free agency</h1>
      {closed && <p className="muted">Free agency is closed. Unsigned players moved to D2 Reserves.</p>}
      <div className="form-row filters">
        <label>Team
          <select value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">All teams</option>
            {teams.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        </label>
        <label>Position
          <select value={pos} onChange={e => setPos(e.target.value as Position | 'ALL')}>
            <option value="ALL">All</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Type
          <select value={type} onChange={e => setType(e.target.value as MarketType | 'ALL')}>
            <option value="ALL">All</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {team && (
        <div className="card team-panel">
          <h3>{teams.teams.find(t => t.teamId === teamId)?.name} · {needs.length ? `Open: ${needs.join(', ')}` : 'No open positions'}</h3>
          <PayrollBar total={payroll(team, state.season)} />
          <div className="table-wrap"><RosterTable league="fba" entries={team} players={state.players.players} /></div>
        </div>
      )}

      {selected && !closed && (
        <SignPanel key={selected} state={state} teams={teams} playerId={selected} defaultTeam={teamId} onClose={() => setSelected(null)} versions={versions} phase={phase} />
      )}

      <div className="table-wrap">
        <table className="roster market">
          <thead><tr><th>Pos</th><th>Player</th><th className="num">Age</th><th className="num">Rating</th><th>Type</th><th>From</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.playerId} className={selected === r.playerId ? 'selected' : ''} onClick={() => setSelected(r.playerId)}>
                <td>{r.position}</td>
                <td>{r.name}</td>
                <td className="num">{r.age ?? '—'}</td>
                <td className="num">{r.rating ?? '—'}{r.scale === 'D2' ? ' D2' : ''}</td>
                <td><span className={`tag tag-${r.type.toLowerCase()}`}>{r.type}</span></td>
                <td>{r.from ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!closed && (
        <div className="card close-fa">
          <h3>Close free agency</h3>
          {blockers.length ? <ul className="problems">{blockers.map(b => <li key={b}>{b}</li>)}</ul> : <p className="ok">✓ Every team is set. Unsigned players will move to D2 Reserves.</p>}
          {closeError && <p className="error">Save failed: {closeError}</p>}
          <button className="btn primary" disabled={blockers.length > 0 || saving} onClick={close}>Close free agency</button>
        </div>
      )}
    </section>
  );
}
