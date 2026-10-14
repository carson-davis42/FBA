import { useMemo, useState } from 'react';
import { careerTotalsAll } from '../../engine/history/career';
import { playerIndex, searchPlayers } from '../../engine/history/views';
import type { PlayerBiosFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { SortTh } from '../components/SortTh';
import { useSort, type SortValue } from '../components/useSort';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import './history.css';

const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/** S78 stored points per game only (no totals); every player's S78 line is taken as this many games. */
const S78_GAMES = 86;

interface Row { playerId: string; name: string; pts: number; ppg: number | null; born: number | null }
const sortValue = (r: Row, key: string): SortValue => (key === 'name' ? r.name : key === 'born' ? r.born : key === 'ppg' ? r.ppg : r.pts);

/** The season a player was born: the player record, else the bio's "Born-S51" / "FFL S2(-3)". */
function birthSeason(birth: number | null | undefined, born: string | undefined): number | null {
  if (birth !== undefined && birth !== null) return birth;
  const m = born ? /^(?:Born-)?S(-?\d+)$/.exec(born.trim()) ?? /^FFL S\d+\((-?\d+)\)$/.exec(born.trim()) : null;
  return m ? Number(m[1]) : null;
}

/** The first letter of the last name, without accents. */
const initial = (name: string): string => {
  const last = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().split(/\s+/).pop() ?? '';
  return last.charAt(0).toUpperCase();
};

export function PlayersHistoryPage() {
  const [q, setQ] = useState('');
  const [letter, setLetter] = useState('');
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const biosData = bios.data ?? null;
  const index = useMemo<Row[]>(() => {
    if (!seasons || !players.data) return [];
    const totals = careerTotalsAll(seasons);
    // S78 has no box scores, only each player's points per game: its points are that average over 86 games, added to the S79+ totals.
    const ppg78 = new Map<string, number>();
    for (const s of seasons) if (s.season === 78) for (const l of s.legacyPpg ?? []) ppg78.set(l.playerId, l.ppg);
    const bioOf = new Map((biosData?.bios ?? []).map(b => [b.playerId, b.born]));
    return playerIndex(seasons, biosData, players.data).map(p => {
      const live = totals.get(p.playerId) ?? { gp: 0, pts: 0 };
      const old = ppg78.get(p.playerId);
      const gp = live.gp + (old !== undefined ? S78_GAMES : 0);
      const pts = live.pts + (old !== undefined ? Math.round(old * S78_GAMES) : 0);
      return {
        ...p, pts, ppg: gp > 0 ? Math.round((pts / gp) * 10) / 10 : null,
        born: birthSeason(players.data!.players[p.playerId]?.birthSeason, bioOf.get(p.playerId)),
      };
    });
  }, [seasons, players.data, biosData]);
  const shown = useMemo(() => (searchPlayers(index, q) as Row[]).filter(p => letter === '' || initial(p.name) === letter), [index, q, letter]);
  const { rows: sorted, sortProps } = useSort<Row>(shown, sortValue, 'name', 'asc');
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing)) return <p className="muted">Loading…</p>;
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="FBA Players" />
      <SkippedWarning errors={errors} />
      <div>
        <input type="search" aria-label="Search players" placeholder="Search players" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips" role="group" aria-label="Filter by last name">
          {['', ...LETTERS].map(l => (
            <button key={l || 'all'} type="button" className={`chip${letter === l ? ' active' : ''}`} aria-pressed={letter === l} onClick={() => setLetter(l)}>{l || 'All'}</button>
          ))}
        </div>
        <p className="muted">{shown.length} {shown.length === 1 ? 'player' : 'players'}</p>
      </div>
      <div className="table-wrap tall">
        <table className="stat-table">
          <thead>
            <tr>
              <SortTh label="Player" {...sortProps('name', 'asc')} />
              <SortTh label="PTS (S78+)" className="n" {...sortProps('pts')} />
              <SortTh label="PPG (S78+)" className="n" {...sortProps('ppg')} />
              <SortTh label="Born" className="n" {...sortProps('born', 'asc')} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.playerId}>
                <td><PlayerLink id={p.playerId} players={players.data as PlayersFile} /></td>
                <td className="n">{p.pts > 0 ? p.pts : ''}</td>
                <td className="n">{p.ppg !== null ? p.ppg.toFixed(1) : ''}</td>
                <td className="n">{p.born !== null ? `S${p.born}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
