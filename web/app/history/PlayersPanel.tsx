import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { seasonRanges, type FranchiseHonour, type FranchisePlayer, type SeasonRosterRow } from '../../engine/history/franchiseRoster';
import type { PlayersFile } from '../../engine/shared/types';
import { PlayerLink } from './PlayerLink';

type Sort = 'name' | 'first' | 'seasons' | 'accolades';

const honourText = (h: FranchiseHonour): string => (h.seasons.length > 0 ? `${h.label} (${h.seasons.map(n => `S${n}`).join(', ')})` : `${h.count}x ${h.label}`);
const accolades = (p: FranchisePlayer): string[] => [
  ...p.honours.map(honourText),
  ...(p.hof ? [/^S\d+$/.test(p.hof) ? `Hall of Fame (${p.hof})` : 'Hall of Fame'] : []),
];
const accoladeCount = (p: FranchisePlayer): number => p.honours.reduce((n, h) => n + h.count, 0) + (p.hof ? 1 : 0);

const SORTS: Record<Sort, (a: FranchisePlayer, b: FranchisePlayer) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  first: (a, b) => a.seasons[0] - b.seasons[0] || a.name.localeCompare(b.name),
  seasons: (a, b) => b.seasons.length - a.seasons.length || a.name.localeCompare(b.name),
  accolades: (a, b) => accoladeCount(b) - accoladeCount(a) || a.name.localeCompare(b.name),
};

export interface PlayersPanelProps {
  index: { players: FranchisePlayer[]; rosterFor(season: number): SeasonRosterRow[] };
  /** The seasons the By season picker offers, oldest first. */
  seasons: number[];
  players: PlayersFile;
  latest: number;
}

/** Every player who played for a team (with their seasons and accolades), or the roster of one chosen season. */
export function PlayersPanel({ index, seasons, players, latest }: PlayersPanelProps) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('first');

  const view = params.get('view') === 'season' ? 'season' : 'all';
  const asked = Number(params.get('season'));
  const season = seasons.includes(asked) ? asked : seasons[seasons.length - 1] ?? latest;
  const update = (changes: Record<string, string | null>) => setParams(prev => {
    const next = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(changes)) { if (v === null) next.delete(k); else next.set(k, v); }
    return next;
  });

  const needle = query.trim().toLowerCase();
  const all = index.players.filter(p => p.name.toLowerCase().includes(needle)).sort(SORTS[sort]);
  const roster = index.rosterFor(season);
  const hasSlots = roster.some(r => r.slot !== null);

  return (
    <div className="stack">
      <div className="fp-controls">
        <button type="button" className="chip" aria-pressed={view === 'all'} onClick={() => update({ view: null })}>All-time</button>
        <button type="button" className="chip" aria-pressed={view === 'season'} onClick={() => update({ view: 'season' })}>By season</button>
        {view === 'all' ? (
          <>
            <input type="search" aria-label="Search players" placeholder="Search players" value={query} onChange={e => setQuery(e.target.value)} />
            <select aria-label="Sort players" value={sort} onChange={e => setSort(e.target.value as Sort)}>
              <option value="first">First season</option>
              <option value="name">Name</option>
              <option value="seasons">Seasons played</option>
              <option value="accolades">Accolades</option>
            </select>
            <span className="muted">{all.length} {all.length === 1 ? 'player' : 'players'}</span>
          </>
        ) : (
          <select aria-label="Season" value={season} onChange={e => update({ season: e.target.value })}>
            {seasons.map(n => <option key={n} value={n}>S{n}</option>)}
          </select>
        )}
      </div>
      {view === 'all' ? (
        all.length === 0 ? <p className="muted">No players found.</p> : (
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>Player</th><th>Seasons</th><th>Accolades</th></tr></thead>
              <tbody>
                {all.map(p => (
                  <tr key={p.playerId}>
                    <td><PlayerLink id={p.playerId} players={players} /></td>
                    <td>{seasonRanges(p.seasons)} <span className="muted">({p.seasons.length})</span></td>
                    <td className="muted">{accolades(p).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : roster.length === 0 ? <p className="muted">No players recorded for this season.</p> : (
        <div className="table-wrap">
          <table className="stat-table">
            <thead>
              <tr><th>Player</th>{hasSlots && <><th>Pos</th><th className="n">Rtg</th><th className="n">Age</th><th className="n">Pts</th></>}<th>Honours</th></tr>
            </thead>
            <tbody>
              {roster.map(r => (
                <tr key={r.playerId}>
                  <td><PlayerLink id={r.playerId} players={players} /></td>
                  {hasSlots && <><td>{r.slot?.position ?? '—'}</td><td className="n">{r.slot?.rating ?? '—'}</td><td className="n">{r.slot?.age ?? '—'}</td><td className="n">{r.slot?.points ?? '—'}</td></>}
                  <td className="muted">{r.honours.join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
