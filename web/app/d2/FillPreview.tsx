import { D2_FILL_FLOOR, fillRatings } from '../../engine/rank/d2Fill';
import { topOf, type NameOf } from '../../engine/rank/ranking';
import type { RankingFile, RankingRow } from '../../engine/shared/types';
import { PlayerName } from '../components/PlayerName';
import '../pages/roster.css';
import '../rank/rank.css';

/** D2 reset: the automatic ratings of everyone outside the top 100, for review before finishing. They follow the top-100 ratings. */
export function FillPreview({ doc, name, teamLabel }: {
  doc: RankingFile;
  name: NameOf;
  teamLabel: (team: string | null, row?: RankingRow) => string;
}) {
  const top = topOf(doc);
  const kept = Object.values(doc.byPosition ?? {}).flat().length;
  if (kept <= top) return null;
  const filled = fillRatings(doc);
  const rowOf = new Map(doc.rows.map(r => [r.playerId, r]));
  return (
    <div className="rank card stack">
      <h3>Rated by position rank · {kept - top}</h3>
      {!filled ? (
        <p className="muted">These ratings appear once all of your top {top} are rated.</p>
      ) : (
        <>
          <p className="muted">
            Each position steps down evenly from your lowest top-{top} rating to {D2_FILL_FLOOR} at its last place. Change a top-{top} rating
            and these follow.
          </p>
          <div className="table-wrap">
            <table className="stat-table rank-table" aria-label="Rated by position rank">
              <thead><tr><th className="rank">#</th><th>Player</th><th>Pos</th><th className="n">Pos rank</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th><th className="n">Rating</th></tr></thead>
              <tbody>
                {filled.map((f, i) => {
                  const r = rowOf.get(f.playerId)!;
                  return (
                    <tr key={f.playerId}>
                      <td className="rank">{top + i + 1}</td>
                      <td><PlayerName id={f.playerId} name={name(f.playerId)} /></td>
                      <td>{f.position}</td>
                      <td className="n">{f.positionRank}</td>
                      <td className="n">{r.age ?? '—'}</td>
                      <td>{teamLabel(r.team, r)}</td>
                      <td className="n">{r.prevRating ?? '—'}</td>
                      <td className="n">{f.rating}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
