import { CONTEST_SPOTS, contestTurn, drawCounts, drawOnClock, startContestDraw } from '../../engine/allstar/contestDraw';
import type { StepProps } from './types';

export function ContestDrawStep({ state, doc, list, readOnly, saving, save }: StepProps) {
  if (!doc) return null;
  const name = (id: string | null) => (id ? list.find(p => p.playerId === id)?.name ?? id : '');
  if (!doc.contestDraw) {
    return (
      <div>
        <p className="muted">Teams are drawn in random order. Each drawn team sends one player to the 5pt or dunk contest, or passes, until 10 + 4 spots fill.</p>
        {!readOnly && <button className="btn primary" disabled={saving} onClick={() => save(startContestDraw(doc, state.teams.teams.map(t => t.teamId), Math.random))}>Start draw</button>}
      </div>
    );
  }
  const counts = drawCounts(doc);
  const team = drawOnClock(doc);
  const roster = team ? list.filter(p => p.teamId === team) : [];
  return (
    <div className="live-grid">
      <div className="card">
        <h3>5pt {counts['5pt']}/{CONTEST_SPOTS['5pt']} · Dunk {counts.dunk}/{CONTEST_SPOTS.dunk}</h3>
        <ol className="pick-order">
          {doc.contestDraw.turns.map((t, i) => (
            <li key={i} className="done">{t.teamId} · {t.contest ? `${name(t.playerId)} → ${t.contest === '5pt' ? '5pt' : 'dunk'}` : 'passed'}</li>
          ))}
          {team && <li className="now">{team} ← on the clock</li>}
        </ol>
      </div>
      {team && !readOnly ? (
        <div className="card">
          <h3>{team} picks a player or passes</h3>
          <table><tbody>
            {roster.map(p => (
              <tr key={p.playerId}>
                <td>{p.name}</td><td>{p.position}</td><td className="n">{p.rating}</td>
                <td>
                  <button className="btn" disabled={saving || counts['5pt'] >= CONTEST_SPOTS['5pt']} onClick={() => save(contestTurn(doc, { contest: '5pt', playerId: p.playerId }, list))}>5pt</button>{' '}
                  <button className="btn" disabled={saving || counts.dunk >= CONTEST_SPOTS.dunk} onClick={() => save(contestTurn(doc, { contest: 'dunk', playerId: p.playerId }, list))}>Dunk</button>
                </td>
              </tr>
            ))}
          </tbody></table>
          <button className="btn" disabled={saving} onClick={() => save(contestTurn(doc, null, list))}>Pass</button>
        </div>
      ) : <p className="muted">The contest fields are set.</p>}
    </div>
  );
}
