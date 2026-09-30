import type { PastBracket as PastBracketDoc, PastSeries, PastSide, Team } from '../../engine/shared/types';
import { TeamName } from '../components/TeamName';
import { ChampBadge, SideRow } from '../playoffs/Bracket';

function Side({ side, wins, won, teams, season }: { side: PastSide | null; wins: number; won: boolean; teams: Team[]; season: number }) {
  if (!side) return <SideRow seed={null} name="BYE" wins={null} won={false} />;
  const t = teams.find(x => x.name === side.name);
  return (
    <SideRow
      seed={side.seed}
      name={t ? <TeamName team={t} season={season} variant="abbr" size={20} /> : side.name}
      wins={wins}
      won={won}
    />
  );
}

/** A transcribed historical bracket in the app bracket's style: left half, the final, mirrored right half. */
export function PastBracket({ bracket, teams, season }: { bracket: PastBracketDoc; teams: Team[]; season: number }) {
  const R = bracket.rounds;
  const byId = new Map(bracket.series.map(s => [s.id, s]));
  const pick = (r: number, half: 'left' | 'right'): PastSeries[] => {
    const n = 2 ** (R - r);
    const out: PastSeries[] = [];
    for (let k = half === 'left' ? 1 : n / 2 + 1; k <= (half === 'left' ? n / 2 : n); k++) {
      const s = byId.get(`R${r}-${k}`);
      if (s) out.push(s);
    }
    return out;
  };
  const left = Array.from({ length: R - 1 }, (_, i) => pick(i + 1, 'left'));
  const right = Array.from({ length: R - 1 }, (_, i) => pick(R - 1 - i, 'right'));
  const centre = [byId.get(`R${R}-1`)].filter((s): s is PastSeries => !!s);
  const columns = [
    ...left.map(col => ({ col, dir: 'l' })),
    { col: centre, dir: 'mid' },
    ...right.map(col => ({ col, dir: 'r' })),
  ];
  return (
    <div className="bracket">
      {columns.map(({ col, dir }, k) => (
        <div key={k} className={`bracket-col ${dir}`}>
          {col.map(s => (
            <div key={s.id} className={`series-box${dir === 'mid' ? ' finals' : ''}${s.winner ? ' decided' : ''}`}>
              {dir === 'mid' && s.winner && <ChampBadge />}
              <Side side={s.home} wins={s.homeWins} won={s.winner === 'home'} teams={teams} season={season} />
              <Side side={s.away} wins={s.awayWins} won={s.winner === 'away'} teams={teams} season={season} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
