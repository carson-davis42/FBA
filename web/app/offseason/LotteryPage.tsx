import { useMemo, useState } from 'react';
import { lotteryPreview, runLottery, type LotteryState } from '../../engine/offseason/lottery';
import { useSaving } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import { useLotteryState } from './useLotteryState';
import '../pages/league.css';

export function LotteryPage() {
  const { state, versions, error } = useLotteryState();
  const saving = useSaving();
  // null = show everything (a lottery loaded from the server); a number = picks revealed so far in a run made in this mount.
  const [revealed, setRevealed] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const preview = useMemo(() => (state ? lotteryPreview(state) : null), [state]);
  const refusal = useMemo(() => {
    if (!state) return null;
    const r = runLottery(state, () => 0.5, { batchId: 'preview' });
    return r.ok ? null : r.problems.join('; ');
  }, [state]);

  if (error) return <p className="error">Couldn't load the lottery: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const nameOf = (id: string) => state.teams.teams.find(t => t.teamId === id)?.name ?? id;
  const title = <h1>S{state.season + 1} Draft Lottery</h1>;

  const run = async (s: LotteryState) => {
    setActionError('');
    const result = runLottery(s, Math.random, { batchId: newBatchId() });
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return;
    }
    setRevealed(0);
    try {
      await commitDocs(result.label, result.writes, versions);
    } catch (e) {
      setRevealed(null);
      setActionError((e as Error).message);
    }
  };

  const doc = state.lottery;
  if (!doc) {
    const problem = refusal && preview && !preview.ok && refusal === preview.problem ? null : refusal;
    return (
      <section>
        {title}
        {preview?.ok ? (
          <div className="table-wrap"><table className="roster">
            <thead><tr><th>Slot</th><th>Team</th><th>W-L</th><th className="num">Pick 1 odds</th></tr></thead>
            <tbody>
              {preview.odds.map(o => (
                <tr key={o.teamId}><td>{o.slot}</td><td>{nameOf(o.teamId)}</td><td>{o.w}-{o.l}</td><td className="num">{o.pct.toFixed(1)}%</td></tr>
              ))}
            </tbody>
          </table></div>
        ) : preview && <p className="error">{preview.problem}</p>}
        <p><button className="btn primary" disabled={saving || Boolean(refusal)} onClick={() => run(state)}>Run lottery</button></p>
        {problem && <p className="muted">{problem}</p>}
        {actionError && <p className="error">{actionError}</p>}
      </section>
    );
  }

  const size = doc.lottery.length;
  const shown = Math.min(revealed ?? size, size);
  const done = shown >= size;
  return (
    <section>
      {title}
      <ol className="lottery-list" reversed start={size} aria-label="Lottery">
        {doc.lottery.map((teamId, i) => ({ teamId, slot: i + 1 })).reverse().map(({ teamId, slot }) => (
          <li key={slot}>
            <strong>{slot}</strong> {slot > size - shown ? nameOf(teamId) : '?'}
          </li>
        ))}
      </ol>
      {!done && (
        <p>
          <button className="btn" onClick={() => setRevealed(shown + 1)}>Reveal next</button>{' '}
          <button className="btn" onClick={() => setRevealed(size)}>Reveal all</button>
        </p>
      )}
      {done && (
        <>
          <h2>Full S{doc.draftSeason} draft order</h2>
          <div className="table-wrap"><table className="roster">
            <thead><tr><th>Slot</th><th>Team</th><th>Via</th><th>Flag</th></tr></thead>
            <tbody>
              {doc.picks.map(p => (
                <tr key={p.slot}>
                  <td>{p.slot}</td>
                  <td>{nameOf(p.owner)}</td>
                  <td>{p.owner === p.originalTeam ? '' : `via ${nameOf(p.originalTeam)}`}</td>
                  <td>{p.flag ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {doc.picks.some(p => p.flag) && <p className="muted">Settle flagged picks by hand in the picks editor.</p>}
        </>
      )}
    </section>
  );
}
