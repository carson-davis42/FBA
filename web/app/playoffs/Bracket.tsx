import { bracketColumns, FINALS } from '../../engine/playoffs/bracket';
import type { SeasonLeague } from '../../engine/season/schedule';
import type { ReactNode } from 'react';
import type { PlayoffSeries, Team } from '../../engine/shared/types';
import { TeamMark } from '../components/TeamMark';

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

/** One side of a series box; shared with the history bracket. */
export function SideRow({ seed, mark, text, wins, won }: { seed: number | null; mark: ReactNode; text: string; wins: number | null; won: boolean }) {
  return (
    <span className={`series-side${won ? ' won' : ''}`}>
      <span className="seed">{seed ?? ''}</span>
      {mark}
      <span className="name">{text}</span>
      <span className="wins">{wins ?? ''}</span>
    </span>
  );
}

function Side({ id, seed, wins, won, teams, season }: { id: string | null; seed: number | null; wins: number; won: boolean; teams: Map<string, Team>; season: number }) {
  const t = id ? teams.get(id) : undefined;
  return (
    <SideRow
      seed={seed}
      mark={t ? <TeamMark team={t} season={season} size={18} /> : <span className="logo" aria-hidden="true" />}
      text={t ? `${t.abbr} ${t.name}` : id ?? 'TBD'}
      wins={id ? wins : null}
      won={won}
    />
  );
}

function SeriesBox({ s, teams, season, open, onOpen }: { s: PlayoffSeries; teams: Map<string, Team>; season: number; open: string | null; onOpen: Props['onOpen'] }) {
  const sides = (
    <>
      <Side id={s.home} seed={s.homeSeed} wins={s.homeWins} won={!!s.winner && s.winner === s.home} teams={teams} season={season} />
      <Side id={s.away} seed={s.awaySeed} wins={s.awayWins} won={!!s.winner && s.winner === s.away} teams={teams} season={season} />
    </>
  );
  if (!onOpen) return <div className="series-box">{sides}</div>;
  return (
    <button type="button" className={`series-box${open === s.id ? ' selected' : ''}`} onClick={() => onOpen(open === s.id ? null : s.id)}>
      {sides}
    </button>
  );
}

/** The bracket as columns; scrolls sideways inside its own box on narrow screens. */
export function Bracket({ league, series, teams, season, group, open, onOpen }: Props) {
  const byId = new Map(series.map(s => [s.id, s]));
  const columns = league === 'fba'
    ? [...bracketColumns('fba', 'E'), [FINALS], ...bracketColumns('fba', 'W').reverse()]
    : bracketColumns('fbad2', group ?? 'PL');
  return (
    <div className="bracket">
      {columns.map((ids, k) => (
        <div key={k} className="bracket-col">
          {ids.map(id => {
            const s = byId.get(id);
            return s ? <SeriesBox key={id} s={s} teams={teams} season={season} open={open} onOpen={onOpen} /> : null;
          })}
        </div>
      ))}
    </div>
  );
}
