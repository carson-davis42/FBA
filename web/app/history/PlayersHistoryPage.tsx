import { useMemo, useState } from 'react';
import { playerIndex, searchPlayers } from '../../engine/history/views';
import type { PlayerBiosFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PlayerLink, SkippedWarning } from './PlayerLink';

export function PlayersHistoryPage() {
  const [q, setQ] = useState('');
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const biosData = bios.data ?? null;
  const index = useMemo(
    () => (seasons && players.data ? playerIndex(seasons, biosData, players.data) : []),
    [seasons, players.data, biosData],
  );
  const shown = useMemo(() => searchPlayers(index, q), [index, q]);
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing)) return <p className="muted">Loading…</p>;
  return (
    <section>
      <h1>FBA Players</h1>
      <SkippedWarning errors={errors} />
      <input type="search" aria-label="Search players" placeholder="Search players" value={q} onChange={e => setQ(e.target.value)} />
      <p className="muted">{shown.length} players</p>
      <ul>
        {shown.map(p => <li key={p.playerId}><PlayerLink id={p.playerId} players={players.data as PlayersFile} /></li>)}
      </ul>
    </section>
  );
}
