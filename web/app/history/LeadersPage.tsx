import { useMemo } from 'react';
import { careerStats } from '../../engine/history/career';
import { playerIndex } from '../../engine/history/views';
import type { PlayerBiosFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import '../pages/season.css';

const TOP = 25;
const MIN_GAMES = 40;

interface Row { playerId: string; name: string; gp: number; pts: number; ppg: number }

export function LeadersPage() {
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const biosData = bios.data ?? null;
  const rows = useMemo<Row[]>(() => {
    if (!seasons || !players.data) return [];
    const out: Row[] = [];
    for (const p of playerIndex(seasons, biosData, players.data)) {
      const { total } = careerStats(p.playerId, seasons);
      if (total.gp > 0) out.push({ playerId: p.playerId, name: p.name, ...total });
    }
    return out;
  }, [seasons, players.data, biosData]);
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing)) return <p className="muted">Loading…</p>;
  const top = (list: Row[], key: 'pts' | 'gp' | 'ppg') =>
    [...list].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId)).slice(0, TOP);
  const table = (title: string, column: string, list: Row[], value: (r: Row) => string) => (
    <div>
      <h2>{title}</h2>
      <div className="table-wrap">
        <table className="standings">
          <thead><tr><th className="n">Rank</th><th>Player</th><th className="n">{column}</th></tr></thead>
          <tbody>
            {list.map((r, k) => (
              <tr key={r.playerId}>
                <td className="n">{k + 1}</td>
                <td><PlayerLink id={r.playerId} players={players.data as PlayersFile} /></td>
                <td className="n">{value(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <section>
      <h1>Career leaders</h1>
      <SkippedWarning errors={errors} />
      {rows.length === 0 ? <p className="muted">No seasons played in the app yet</p> : (
        <>
          <p className="muted">Since S79</p>
          {table('Points', 'PTS', top(rows, 'pts'), r => String(r.pts))}
          {table('Games', 'GP', top(rows, 'gp'), r => String(r.gp))}
          {table(`Points per game (min ${MIN_GAMES} games)`, 'PPG', top(rows.filter(r => r.gp >= MIN_GAMES), 'ppg'), r => r.ppg.toFixed(1))}
        </>
      )}
    </section>
  );
}
