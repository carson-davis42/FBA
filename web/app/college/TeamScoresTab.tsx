import { useMemo, useState } from 'react';
import { rankScores, POINTS_BASELINE, teamRecruitingScores, type ScoreKind, type ScoreLine } from '../../engine/college/teamScores';
import type { RecruitingState } from '../../engine/college/state';
import { School } from './School';

const KINDS: { id: ScoreKind; label: string }[] = [
  { id: 'combined', label: 'Combined' },
  { id: 'class', label: 'New class' },
  { id: 'portal', label: 'Transfer portal' },
];

const stars = (l: ScoreLine) => [l.stars.five && `${l.stars.five}×5★`, l.stars.four && `${l.stars.four}×4★`, l.stars.three && `${l.stars.three}×3★`].filter(Boolean).join(' ');

/**
 * Each school's recruiting score: the new class, the transfer portal and both together. A committed player earns his rating above
 * the baseline in points, so a school's score is how much quality it has landed. Ranked by the score picked.
 */
export function TeamScoresTab({ state }: { state: RecruitingState }) {
  const [kind, setKind] = useState<ScoreKind>('combined');
  const [all, setAll] = useState(false);
  const board = state.recruiting;
  const scores = useMemo(() => teamRecruitingScores(board, state.teams.teams.map(t => t.teamId)), [board, state.teams.teams]);
  const ranked = rankScores(scores, kind);
  const shown = all ? ranked : ranked.filter(r => r.score.combined.count > 0);
  const unrated = scores.reduce((n, s) => n + s.combined.unrated, 0);
  const cell = (l: ScoreLine) => (l.count > 0 ? <><td className="n">{l.count}</td><td className="n">{l.points}</td></> : <><td className="n muted">—</td><td className="n muted">—</td></>);
  return (
    <div className="stack">
      <div className="card">
        <p className="muted">
          Each committed player earns his rating above {POINTS_BASELINE} in points (a 94 is worth {94 - POINTS_BASELINE}), so a school's score is
          the quality it has landed, and more good players count for more. Ranked by points, then average rating.
        </p>
        <div className="chips" role="group" aria-label="Rank by">
          {KINDS.map(k => (
            <button key={k.id} type="button" className={`chip${kind === k.id ? ' on' : ''}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
          <label className="muted"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Show schools with no commits</label>
        </div>
        {unrated > 0 && <p className="muted">{unrated} committed {unrated === 1 ? 'player has' : 'players have'} no rating yet (the class isn't ranked), so {unrated === 1 ? 'earns' : 'earn'} no points.</p>}
      </div>
      {shown.length === 0 ? <p className="muted">No commitments yet.</p> : (
        <div className="table-wrap tall">
          <table className="stat-table" aria-label="Team recruiting scores">
            <thead>
              <tr>
                <th className="n">#</th><th>School</th>
                <th className="n" colSpan={2}>New class</th><th className="n" colSpan={2}>Portal</th><th className="n" colSpan={2}>Combined</th><th className="n">Avg</th><th>Stars</th>
              </tr>
              <tr>
                <th></th><th></th>
                <th className="n">Players</th><th className="n">Pts</th><th className="n">Players</th><th className="n">Pts</th><th className="n">Players</th><th className="n">Pts</th><th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ score, rank }) => (
                <tr key={score.teamId}>
                  <td className="n">{rank}</td>
                  <td><School state={state} teamId={score.teamId} /></td>
                  {cell(score.class)}
                  {cell(score.portal)}
                  {cell(score.combined)}
                  <td className="n">{score.combined.avg ?? '—'}</td>
                  <td className="muted">{stars(score.combined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
