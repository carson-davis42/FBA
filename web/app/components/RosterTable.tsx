import type { ReactNode } from 'react';
import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';
import { playerLabel, rosterColumns } from './rosterColumns';

export function RosterTable({ league, entries, players, extraLabel, renderExtra }: {
  league: LeagueId;
  entries: RosterEntry[];
  players: Record<string, Player>;
  extraLabel?: string;
  renderExtra?: (e: RosterEntry) => ReactNode;
}) {
  const columns = rosterColumns(league);
  return (
    <table className="roster">
      <thead>
        <tr>
          {columns.map(c => <th key={c.label} className={c.numeric ? 'num' : ''}>{c.label}</th>)}
          {renderExtra && <th>{extraLabel ?? ''}</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => {
          const name = playerLabel(e, players);
          return (
            <tr key={`${e.position}-${i}`} className={e.playerId === null ? 'vacant' : ''}>
              {columns.map(c => <td key={c.label} className={c.numeric ? 'num' : ''}>{c.value(e, name)}</td>)}
              {renderExtra && <td>{renderExtra(e)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
