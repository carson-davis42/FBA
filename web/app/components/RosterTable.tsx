import type { ReactNode } from 'react';
import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';
import { playerLabel, rosterColumns } from './rosterColumns';

export function RosterTable({ league, entries, players, ppg, extraLabel, renderExtra }: {
  league: LeagueId;
  entries: RosterEntry[];
  players: Record<string, Player>;
  ppg?: Map<string, number>;
  extraLabel?: string;
  renderExtra?: (e: RosterEntry) => ReactNode;
}) {
  const columns = rosterColumns(league);
  return (
    <table className="roster">
      <thead>
        <tr>
          {columns.map(c => <th key={c.label} className={c.numeric ? 'num' : ''}>{c.label}</th>)}
          {ppg && <th className="num">PPG</th>}
          {renderExtra && <th>{extraLabel ?? ''}</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => {
          const name = playerLabel(e, players);
          return (
            <tr key={`${e.position}-${i}`} className={e.playerId === null ? 'vacant' : ''}>
              {columns.map(c => <td key={c.label} className={c.numeric ? 'num' : ''}>{c.value(e, name)}</td>)}
              {ppg && <td className="num">{e.playerId && ppg.has(e.playerId) ? ppg.get(e.playerId)!.toFixed(1) : '—'}</td>}
              {renderExtra && <td>{renderExtra(e)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
