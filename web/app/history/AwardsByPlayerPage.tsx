import { useMemo, useState } from 'react';
import { awardTotals } from '../../engine/history/career';
import { playerIndex } from '../../engine/history/views';
import { AWARD_KEYS, type AwardCountsFile, type AwardKey, type PlayerBiosFile, type PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { AWARD_LABELS } from './CareerSection';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import '../pages/season.css';

const COLUMNS = AWARD_KEYS.filter(k => k !== 'CSHIP_APP' && k !== 'CONF_CHAMPION');

export function AwardsByPlayerPage() {
  const [sort, setSort] = useState<AwardKey>('MVP');
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const counts = useDoc<AwardCountsFile>('leagues/fba/awardCounts.json');
  const biosData = bios.data ?? null;
  const baseline = counts.data ?? null;
  const rows = useMemo(() => {
    if (!seasons || !players.data) return [];
    return playerIndex(seasons, biosData, players.data)
      .map(p => ({ ...p, totals: awardTotals(p.playerId, baseline, seasons) }))
      .filter(r => COLUMNS.some(k => r.totals[k] > 0));
  }, [seasons, players.data, biosData, baseline]);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.totals[sort] - a.totals[sort] || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId)),
    [rows, sort],
  );
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error) ?? (counts.missing ? undefined : counts.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing) || (!counts.data && !counts.missing)) {
    return <p className="muted">Loading…</p>;
  }
  return (
    <section>
      <h1>Awards by player</h1>
      <SkippedWarning errors={errors} />
      {baseline === null && <p className="warning">Award counts before S79 haven't been imported</p>}
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th>Player</th>
              {COLUMNS.map(k => (
                <th key={k} className="n"><button type="button" onClick={() => setSort(k)}>{AWARD_LABELS[k]}</button></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.playerId}>
                <td><PlayerLink id={r.playerId} players={players.data as PlayersFile} /></td>
                {COLUMNS.map(k => <td key={k} className="n">{r.totals[k] > 0 ? r.totals[k] : ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
