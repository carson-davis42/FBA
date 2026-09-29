import { useMemo, useState } from 'react';
import {
  autoRetirees, RETIRE_AGE, RETIREMENT_STEP, retirePlayers, retirementPool, unknownAges, type Retiree,
} from '../../engine/offseason/retirement';
import { calendarProblem } from '../../engine/season/moves';
import type { CalendarFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import '../pages/league.css';

const MIN_QUERY = 3;
const MAX_RESULTS = 20;
const place = (r: Retiree) => r.teamId ?? 'Reserves';
const leagueName = (r: Retiree) => (r.league === 'fba' ? 'FBA' : 'D2');

export function RetirementPage() {
  const { state, versions, error } = useRosterState();
  const calendar = useDoc<CalendarFile>('calendar.json');
  const saving = useSaving();
  const [early, setEarly] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const pool = useMemo(() => (state ? retirementPool(state) : []), [state]);

  const err = error ?? calendar.error;
  if (err) return <p className="error">Couldn't load retirement: {err.message}</p>;
  if (!state || !calendar.data) return <p className="muted">Loading…</p>;
  const cal = calendar.data;
  const title = <h1>S{state.season} Retirement</h1>;
  const done = cal.steps.find(s => s.id === RETIREMENT_STEP)?.done ?? false;
  if (done) return <section>{title}<p>Retirement is done for S{state.season}.</p></section>;

  const auto = autoRetirees(pool);
  const byId = new Map(pool.map(r => [r.playerId, r]));
  const earlyRows = early.map(id => byId.get(id)).filter((r): r is Retiree => Boolean(r));
  const listed = new Set([...auto, ...earlyRows].map(r => r.playerId));
  const q = query.trim().toLowerCase();
  const results = q.length >= MIN_QUERY
    ? pool.filter(r => !listed.has(r.playerId) && r.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
    : [];
  const unknown = unknownAges(pool).filter(r => !listed.has(r.playerId));
  const total = auto.length + earlyRows.length;
  const problem = calendarProblem(cal, RETIREMENT_STEP, 'Players retire');

  const add = (id: string) => { setEarly(list => (list.includes(id) ? list : [...list, id])); setQuery(''); };
  const remove = (id: string) => setEarly(list => list.filter(x => x !== id));
  const retire = async () => {
    setActionError('');
    const result = retirePlayers({ ...state, calendar: cal }, early, { batchId: newBatchId() });
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return;
    }
    try {
      await commitDocs(result.label, result.writes, { ...versions, 'calendar.json': calendar.version });
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const row = (r: Retiree, removable: boolean) => (
    <tr key={r.playerId}>
      <td>{r.name}</td><td>{r.position}</td><td>{place(r)}</td><td>{leagueName(r)}</td>
      <td className="num">{r.age ?? '?'}</td>
      <td>{removable && <button className="btn" onClick={() => remove(r.playerId)}>Remove</button>}</td>
    </tr>
  );

  return (
    <section>
      {title}
      <p className="muted">Players age {RETIRE_AGE} and older retire automatically. Add anyone else who retires early.</p>
      <div className="table-wrap"><table className="roster">
        <thead><tr><th>Name</th><th>Pos</th><th>Team</th><th>League</th><th className="num">Age</th><th></th></tr></thead>
        <tbody>
          {auto.map(r => row(r, false))}
          {earlyRows.map(r => row(r, true))}
        </tbody>
      </table></div>
      <p>
        <label>Add an early retirement{' '}
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`At least ${MIN_QUERY} letters`} />
        </label>
      </p>
      {results.length > 0 && (
        <ul aria-label="Search results">
          {results.map(r => (
            <li key={r.playerId}>
              <span>{r.name}</span> {r.position} {place(r)} {leagueName(r)}, age {r.age ?? '?'}{' '}
              <button className="btn" onClick={() => add(r.playerId)}>Add</button>
            </li>
          ))}
        </ul>
      )}
      {unknown.length > 0 && (
        <div className="muted">
          <p>Unknown age: these players have no birth season, so they are not retired automatically.</p>
          <ul>
            {unknown.map(r => (
              <li key={r.playerId}>
                {r.name} ({r.position}, {place(r)}, {leagueName(r)}){' '}
                <button className="btn" onClick={() => add(r.playerId)}>Add</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p><button className="btn primary" disabled={saving || Boolean(problem)} onClick={retire}>Retire {total} {total === 1 ? 'player' : 'players'}</button></p>
      {problem && <p className="muted">{problem}</p>}
      {actionError && <p className="error">{actionError}</p>}
    </section>
  );
}
