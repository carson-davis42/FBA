import type { ReactNode } from 'react';
import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';
import { playerLabel, rosterColumns } from './rosterColumns';
import { SortTh } from './SortTh';
import { useSort, type SortValue } from './useSort';

/** Sort key per column label; columns without one are not sortable. */
const SORT_KEY: Record<string, string> = { Pos: 'position', Player: 'name', Age: 'age', Rating: 'rating', Contract: 'salary' };

type Row = { e: RosterEntry; name: string };

const sortValue = (r: Row, key: string): SortValue => {
  if (key === 'name') return r.e.playerId === null ? null : r.name;
  if (key === 'position') return r.e.position;
  if (key === 'age') return r.e.age;
  if (key === 'rating') return r.e.rating;
  return r.e.contractAmount;
};

/** Read-only views (no `renderExtra`) sort by column; the editing grid keeps the given order. */
export function RosterTable({ league, entries, players, ppg, extraLabel, renderExtra }: {
  league: LeagueId;
  entries: RosterEntry[];
  players: Record<string, Player>;
  ppg?: Map<string, number>;
  extraLabel?: string;
  renderExtra?: (e: RosterEntry) => ReactNode;
}) {
  const columns = rosterColumns(league);
  const sortable = !renderExtra;
  const rows: Row[] = entries.map(e => ({ e, name: playerLabel(e, players) }));
  const { rows: shown, sortProps } = useSort(rows, sortValue);
  const list = sortable ? shown : rows;
  return (
    <table className="stat-table roster">
      <thead>
        <tr>
          {columns.map(c => {
            const key = SORT_KEY[c.label];
            const cls = c.numeric ? 'num' : '';
            return sortable && key
              ? <SortTh key={c.label} label={c.label} className={cls} {...sortProps(key, key === 'name' || key === 'position' ? 'asc' : 'desc')} />
              : <th key={c.label} className={cls}>{c.label}</th>;
          })}
          {ppg && <th className="num">PPG</th>}
          {renderExtra && <th>{extraLabel ?? ''}</th>}
        </tr>
      </thead>
      <tbody>
        {list.map(({ e, name }, i) => (
          <tr key={`${e.position}-${e.playerId ?? i}`} className={e.playerId === null ? 'vacant' : ''}>
            {columns.map(c => <td key={c.label} className={c.numeric ? 'num' : ''}>{c.value(e, name)}</td>)}
            {ppg && <td className="num">{e.playerId && ppg.has(e.playerId) ? ppg.get(e.playerId)!.toFixed(1) : '—'}</td>}
            {renderExtra && <td>{renderExtra(e)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
