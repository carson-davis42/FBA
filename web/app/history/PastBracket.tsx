import type { FranchisesFile, PastBracket as PastBracketDoc, PastSeries, PastSide, Team } from '../../engine/shared/types';
import { ChampBadge, SideRow } from '../playoffs/Bracket';
import { TeamFull } from './useTeams';

function Side({ side, wins, won, teams, franchises, season }: { side: PastSide | null; wins: number | string; won: boolean; teams: Team[]; franchises: FranchisesFile | null; season: number }) {
  if (!side) return <SideRow seed={null} name="BYE" wins={null} won={false} />;
  return (
    <SideRow
      seed={side.seed}
      name={<TeamFull teams={teams} franchises={franchises} name={side.name} season={season} variant="abbr" size={20} />}
      wins={wins}
      won={won}
    />
  );
}

/** A transcribed historical bracket in the app bracket's style: left half, the final, mirrored right half. */
export function PastBracket({ bracket, teams, season, franchises = null }: { bracket: PastBracketDoc; teams: Team[]; season: number; franchises?: FranchisesFile | null }) {
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
          {col.map(s => {
            const none = s.unscored ? '' : null;
            const pts = s.score ? s.score.split(/[–-]/) : null;
            const winHome = s.winner === 'home';
            return (
            <div key={s.id} className={`series-box${s.score || s.unscored ? ' past' : ''}${dir === 'mid' ? ' finals' : ''}${s.winner ? ' decided' : ''}`}>
              {dir === 'mid' && s.winner && <ChampBadge />}
              <Side side={s.home} wins={none ?? (pts ? pts[winHome ? 0 : 1] : s.homeWins)} won={s.winner === 'home'} teams={teams} franchises={franchises} season={season} />
              <Side side={s.away} wins={none ?? (pts ? pts[winHome ? 1 : 0] : s.awayWins)} won={s.winner === 'away'} teams={teams} franchises={franchises} season={season} />
            </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
