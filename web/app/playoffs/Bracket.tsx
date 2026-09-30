import { bracketColumns, FINALS } from '../../engine/playoffs/bracket';
import type { SeasonLeague } from '../../engine/season/schedule';
import type { ReactNode } from 'react';
import type { PlayoffSeries, Team } from '../../engine/shared/types';
import { Badge } from '../components/Badge';
import { TeamName } from '../components/TeamName';
import './playoffs.css';

interface Props {
  league: SeasonLeague;
  series: PlayoffSeries[];
  teams: Map<string, Team>;
  season: number;
  /** The FBA shows E, then the Finals, then W mirrored; the D2 shows the one picked league. */
  group: string | null;
  open: string | null;
  onOpen?: (id: string | null) => void;
}

/** One side of a series box; shared with the history bracket. `name` is a team name with its logo, or plain text. */
export function SideRow({ seed, name, wins, won }: { seed: number | null; name: ReactNode; wins: number | null; won: boolean }) {
  return (
    <span className={`series-side${won ? ' won' : ''}`}>
      <span className="seed">{seed ?? ''}</span>
      <span className="name">{name}</span>
      <span className="wins">{wins ?? ''}</span>
    </span>
  );
}

/** The champion badge row of a decided Finals box (shared with the history bracket). */
export function ChampBadge() {
  return <span className="champ-badge"><Badge kind="champion">Champion</Badge></span>;
}

function Side({ id, seed, wins, won, teams, season }: { id: string | null; seed: number | null; wins: number; won: boolean; teams: Map<string, Team>; season: number }) {
  const t = id ? teams.get(id) : undefined;
  return (
    <SideRow
      seed={seed}
      name={t ? <TeamName team={t} season={season} variant="abbr" size={20} /> : id ?? 'TBD'}
      wins={id ? wins : null}
      won={won}
    />
  );
}

function SeriesBox({ s, teams, season, open, onOpen, finals }: { s: PlayoffSeries; teams: Map<string, Team>; season: number; open: string | null; onOpen: Props['onOpen']; finals: boolean }) {
  const cls = `series-box${finals ? ' finals' : ''}${s.winner ? ' decided' : ''}`;
  const sides = (
    <>
      {finals && s.winner && <ChampBadge />}
      <Side id={s.home} seed={s.homeSeed} wins={s.homeWins} won={!!s.winner && s.winner === s.home} teams={teams} season={season} />
      <Side id={s.away} seed={s.awaySeed} wins={s.awayWins} won={!!s.winner && s.winner === s.away} teams={teams} season={season} />
    </>
  );
  if (!onOpen) return <div className={cls}>{sides}</div>;
  return (
    <button type="button" className={`${cls}${open === s.id ? ' selected' : ''}`} onClick={() => onOpen(open === s.id ? null : s.id)}>
      {sides}
    </button>
  );
}

/** The bracket as columns; scrolls sideways inside its own box on narrow screens. */
export function Bracket({ league, series, teams, season, group, open, onOpen }: Props) {
  const byId = new Map(series.map(s => [s.id, s]));
  const east = league === 'fba' ? bracketColumns('fba', 'E') : [];
  const d2 = league === 'fba' ? [] : bracketColumns('fbad2', group ?? 'PL');
  const columns: { ids: string[]; dir: 'l' | 'mid' | 'r' | 'end' }[] = league === 'fba'
    ? [
        ...east.map(ids => ({ ids, dir: 'l' as const })),
        { ids: [FINALS], dir: 'mid' as const },
        ...bracketColumns('fba', 'W').reverse().map(ids => ({ ids, dir: 'r' as const })),
      ]
    : d2.map((ids, k) => ({ ids, dir: k === d2.length - 1 ? 'end' as const : 'l' as const }));
  return (
    <div className="bracket">
      {columns.map((col, k) => (
        <div key={k} className={`bracket-col ${col.dir}`}>
          {col.ids.map(id => {
            const s = byId.get(id);
            return s ? <SeriesBox key={id} s={s} teams={teams} season={season} open={open} onOpen={onOpen} finals={col.dir === 'mid' || col.dir === 'end'} /> : null;
          })}
        </div>
      ))}
    </div>
  );
}
