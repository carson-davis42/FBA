import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { marketRows, type MarketType, openPositions } from '../../engine/roster/market';
import { closeFreeAgency, freeAgencyBlockers } from '../../engine/roster/moves';
import { payroll, POSITIONS } from '../../engine/roster/rules';
import { currentStepIndex, markCurrentDone } from '../../engine/shared/calendar';
import type { CalendarFile, Position, Team, TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PayrollBar } from '../components/PayrollBar';
import { RosterTable } from '../components/RosterTable';
import { SignPanel } from '../components/SignPanel';
import { SortTh } from '../components/SortTh';
import { TeamName } from '../components/TeamName';
import { teamTheme, teamVars } from '../components/teamColors';
import { useSort, type SortValue } from '../components/useSort';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import { useSeasonPhase } from '../season/useSeasonPhase';
import './roster.css';
import { PlayerName } from '../components/PlayerName';

const TYPES: MarketType[] = ['FA', 'Rookie', 'D2', 'Expired'];

type MarketRow = ReturnType<typeof marketRows>[number];
const marketValue = (r: MarketRow, key: string): SortValue => (key === 'name' ? r.name : key === 'position' ? r.position : key === 'age' ? r.age : r.rating);

function MarketTable({ rows, selected, onSelect, teams, season }: {
  rows: MarketRow[]; selected: string | null; onSelect: (id: string) => void; teams: Team[]; season: number;
}) {
  const { rows: sorted, sortProps } = useSort(rows, marketValue);
  return (
    <div className="table-wrap tall">
      <table className="stat-table market">
        <thead>
          <tr>
            <SortTh label="Pos" {...sortProps('position', 'asc')} />
            <SortTh label="Player" {...sortProps('name', 'asc')} />
            <SortTh label="Age" className="num" {...sortProps('age', 'asc')} />
            <SortTh label="Rating" className="num" {...sortProps('rating')} />
            <th>Type</th>
            <th>From</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => {
            const from = r.type !== 'D2' && r.from ? teams.find(t => t.teamId === r.from) : undefined;
            return (
              <tr key={r.playerId} className={selected === r.playerId ? 'selected' : ''} onClick={() => onSelect(r.playerId)}>
                <td>{r.position}</td>
                <td><PlayerName id={r.playerId} name={r.name} /></td>
                <td className="num">{r.age ?? '—'}</td>
                <td className="num">{r.rating ?? '—'}{r.scale === 'D2' ? ' D2' : ''}</td>
                <td><span className={`tag tag-${r.type.toLowerCase()}`}>{r.type}</span></td>
                <td>{from ? <TeamName team={from} season={season} variant="abbr" size={18} /> : r.from ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
  const pickedTeam = teams.teams.find(t => t.teamId === teamId);
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
      <PageHeader kicker="FBA" title={`S${state.season} free agency`} />
      {closed && <p className="muted">Free agency is closed. Unsigned players moved to D2 Reserves.</p>}
      <div className="form-row filters card">
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
        <div className="card headed team-panel" style={pickedTeam ? teamVars(teamTheme(pickedTeam, "fba")) : undefined}>
          <h3>{pickedTeam ? <TeamName team={pickedTeam} season={state.season} /> : null} · {needs.length ? `Open: ${needs.join(', ')}` : 'No open positions'}</h3>
          <PayrollBar total={payroll(team, state.season)} />
          <div className="table-wrap"><RosterTable league="fba" entries={team} players={state.players.players} /></div>
        </div>
      )}

      {selected && !closed && (
        <SignPanel key={selected} state={state} teams={teams} playerId={selected} defaultTeam={teamId} onClose={() => setSelected(null)} versions={versions} phase={phase} />
      )}

      <MarketTable rows={rows} selected={selected} onSelect={setSelected} teams={teams.teams} season={state.season} />

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
