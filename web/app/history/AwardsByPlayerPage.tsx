import { useMemo } from 'react';
import { awardTotalsAll } from '../../engine/history/career';
import { playerIndex } from '../../engine/history/views';
import { AWARD_KEYS, type AwardCountsFile, type AwardKey, type PlayerBiosFile, type PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { SortTh } from '../components/SortTh';
import { useSort, type SortValue } from '../components/useSort';
import { AWARD_LABELS } from './CareerSection';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import './history.css';

const COLUMNS = AWARD_KEYS.filter(k => k !== 'CSHIP_APP' && k !== 'CONF_CHAMPION');

type Row = { playerId: string; name: string; totals: Record<AwardKey, number> };
const sortValue = (r: Row, key: string): SortValue => (key === 'name' ? r.name : r.totals[key as AwardKey]);

export function AwardsByPlayerPage() {
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const counts = useDoc<AwardCountsFile>('leagues/fba/awardCounts.json');
  const biosData = bios.data ?? null;
  const baseline = counts.data ?? null;
  const rows = useMemo(() => {
    if (!seasons || !players.data) return [];
    const totals = awardTotalsAll(baseline, seasons);
    const named = playerIndex(seasons, biosData, players.data);
    const known = new Set(named.map(p => p.playerId));
    // A player whose only awards are in the baseline has no bio or summary line, so playerIndex may not list them.
    for (const id of totals.keys()) {
      const name = players.data.players[id]?.name;
      if (!known.has(id) && name) named.push({ playerId: id, name });
    }
    return named
      .map(p => ({ ...p, totals: totals.get(p.playerId) as Record<AwardKey, number> }))
      .filter(r => r.totals && COLUMNS.some(k => r.totals[k] > 0));
  }, [seasons, players.data, biosData, baseline]);
  // Name order is the tie-break: useSort keeps ties in the given order.
  const byName = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId)), [rows]);
  const { rows: sorted, sortProps } = useSort<Row>(byName, sortValue, 'MVP', 'desc');
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error) ?? (counts.missing ? undefined : counts.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing) || (!counts.data && !counts.missing)) {
    return <p className="muted">Loading…</p>;
  }
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="Awards by player" />
      <SkippedWarning errors={errors} />
      {baseline === null && <p className="warning">Award counts before S79 haven't been imported</p>}
      <div className="table-wrap tall">
        <table className="stat-table">
          <thead>
            <tr>
              <SortTh label="Player" {...sortProps('name', 'asc')} />
              {COLUMNS.map(k => <SortTh key={k} label={AWARD_LABELS[k]} className="n" {...sortProps(k)} />)}
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
