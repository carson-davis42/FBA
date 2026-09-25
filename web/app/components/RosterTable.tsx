import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';
import { playerLabel, rosterColumns } from './rosterColumns';

export function RosterTable({ league, entries, players }: { league: LeagueId; entries: RosterEntry[]; players: Record<string, Player> }) {
  const columns = rosterColumns(league);
  return (
    <table className="roster">
      <thead>
        <tr>{columns.map(c => <th key={c.label} className={c.numeric ? 'num' : ''}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {entries.map((e, i) => {
          const name = playerLabel(e, players);
          return (
            <tr key={`${e.position}-${i}`} className={e.playerId === null ? 'vacant' : ''}>
              {columns.map(c => <td key={c.label} className={c.numeric ? 'num' : ''}>{c.value(e, name)}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
