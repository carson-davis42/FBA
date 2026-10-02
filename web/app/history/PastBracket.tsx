import type { FranchisesFile, PastBracket as PastBracketDoc, PastSeries, PastSide, Team } from '../../engine/shared/types';
import { ChampBadge, SideRow } from '../playoffs/Bracket';
import { TeamFull } from './useTeams';

const SCORE = /^(\d+)[–-](\d+)(?: (\d?OT))?$/;

function Side({ side, wins, won, teams, franchises, season, showRecords }: { side: PastSide | null; wins: number | string; won: boolean; teams: Team[]; franchises: FranchisesFile | null; season: number; showRecords: boolean }) {
  if (!side) return <SideRow seed={null} name="BYE" wins={null} won={false} />;
  return (
    <SideRow
      seed={side.seed}
      name={<>
        <TeamFull teams={teams} franchises={franchises} name={side.name} season={season} variant="abbr" size={20} />
        {showRecords && side.record && <span className="rec">{side.record}</span>}
      </>}
      wins={wins}
      won={won}
    />
  );
}

interface BracketProps { bracket: PastBracketDoc; teams: Team[]; season: number; franchises: FranchisesFile | null; showRecords: boolean }

/** One game or series box: points or wins beside each side, an OT tag, the champion badge on the final. */
function SeriesBox({ s, finals, ...rest }: { s: PastSeries; finals: boolean } & Omit<BracketProps, 'bracket'>) {
  const none = s.unscored ? '' : null;
  const m = s.score ? SCORE.exec(s.score) : null;
  const pts = m ? [m[1], m[2]] : null;
  const winHome = s.winner === 'home';
  return (
    <div className={`series-box${s.score || s.unscored ? ' past' : ''}${finals ? ' finals' : ''}${s.winner ? ' decided' : ''}`}>
      {finals && s.winner && <ChampBadge />}
      <Side side={s.home} wins={none ?? (pts ? pts[winHome ? 0 : 1] : s.homeWins)} won={s.winner === 'home'} {...rest} />
      <Side side={s.away} wins={none ?? (pts ? pts[winHome ? 1 : 0] : s.awayWins)} won={s.winner === 'away'} {...rest} />
      {m?.[3] && <span className="series-ot">{m[3]}</span>}
    </div>
  );
}

/** What a round is called by the number of teams still in it: Round of 64, Round of 32, Sweet 16, Elite 8, Final Four, Championship. */
export function roundLabel(rounds: number, round: number): string {
  const teams = 2 ** (rounds - round + 1);
  return teams === 2 ? 'Championship' : teams === 4 ? 'Final Four' : teams === 8 ? 'Elite 8' : teams === 16 ? 'Sweet 16' : `Round of ${teams}`;
}

/** The big college pages (32 or 64 slots): one-sided, left to right, every round a column with its games spread so each sits between the two it came from. */
function ColumnsBracket({ bracket, ...rest }: BracketProps) {
  const R = bracket.rounds;
  const byId = new Map(bracket.series.map(s => [s.id, s]));
  return (
    <div className="bracket cols">
      {Array.from({ length: R }, (_, i) => i + 1).map(r => {
        const n = 2 ** (R - r);
        return (
          <div key={r} className={`cols-col${r === R ? ' last' : ''}${r === 1 ? ' first' : ''}`}>
            <h3 className="col-head">{roundLabel(R, r)}</h3>
            <div className="col-slots">
              {Array.from({ length: n }, (_, k) => {
                const s = byId.get(`R${r}-${k + 1}`);
                return (
                  <div key={k} className="col-slot">
                    {s && (s.home || s.away)
                      ? <SeriesBox s={s} finals={r === R} {...rest} />
                      : <div className="series-box empty" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The small brackets (up to 16 teams) in the app bracket's style: left half, the final, mirrored right half. */
function TreeBracket({ bracket, ...rest }: BracketProps) {
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
          {col.map(s => (!s.home && !s.away
            ? <div key={s.id} className="series-box empty" aria-hidden="true" />
            : <SeriesBox key={s.id} s={s} finals={dir === 'mid'} {...rest} />))}
        </div>
      ))}
    </div>
  );
}

/**
 * A transcribed historical bracket. Pages of 32 or more slots (the college pages) are a one-sided bracket with a column per round;
 * smaller ones keep the two-sided tree. A scored game shows its points (with an OT tag), `showRecords` prints each
 * team's record after its name, and `layout` forces one of the two views.
 */
export function PastBracket({ bracket, teams, season, franchises = null, showRecords = false, layout = 'auto' }: {
  bracket: PastBracketDoc; teams: Team[]; season: number; franchises?: FranchisesFile | null; showRecords?: boolean; layout?: 'auto' | 'tree' | 'rounds';
}) {
  const props = { bracket, teams, season, franchises, showRecords };
  const rounds = layout === 'rounds' || (layout === 'auto' && bracket.rounds >= 5);
  return rounds ? <ColumnsBracket {...props} /> : <TreeBracket {...props} />;
}
