import { bracketColumns, FINALS } from '../../engine/playoffs/bracket';
import type { SeasonLeague } from '../../engine/season/schedule';
import type { PlayoffSeries, PlayoffsFile, Team } from '../../engine/shared/types';
import { TeamMark } from '../components/TeamMark';

interface Props {
  league: SeasonLeague;
  playoffs: PlayoffsFile;
  teams: Map<string, Team>;
  season: number;
  /** The FBA shows E, then the Finals, then W mirrored; the D2 shows the one picked league. */
  group: string | null;
  open: string | null;
  onOpen: (id: string | null) => void;
}

function Side({ id, seed, wins, won, teams, season }: { id: string | null; seed: number | null; wins: number; won: boolean; teams: Map<string, Team>; season: number }) {
  const t = id ? teams.get(id) : undefined;
  return (
    <span className={`series-side${won ? ' won' : ''}`}>
      <span className="seed">{seed ?? ''}</span>
      {t && <TeamMark team={t} season={season} size={18} />}
      <span className="name">{t ? `${t.abbr} ${t.name}` : id ?? 'TBD'}</span>
      <span className="wins">{id ? wins : ''}</span>
    </span>
  );
}

function SeriesBox({ s, teams, season, open, onOpen }: { s: PlayoffSeries; teams: Map<string, Team>; season: number; open: string | null; onOpen: Props['onOpen'] }) {
  return (
    <button type="button" className={`series-box${open === s.id ? ' selected' : ''}`} onClick={() => onOpen(open === s.id ? null : s.id)}>
      <Side id={s.home} seed={s.homeSeed} wins={s.homeWins} won={!!s.winner && s.winner === s.home} teams={teams} season={season} />
      <Side id={s.away} seed={s.awaySeed} wins={s.awayWins} won={!!s.winner && s.winner === s.away} teams={teams} season={season} />
    </button>
  );
}

/** The bracket as columns; scrolls sideways inside its own box on narrow screens. */
export function Bracket({ league, playoffs, teams, season, group, open, onOpen }: Props) {
  const byId = new Map(playoffs.series.map(s => [s.id, s]));
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
