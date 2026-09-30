import { useMemo, useState } from 'react';
import { lotteryPreview, runLottery, type LotteryState } from '../../engine/offseason/lottery';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useSaving } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import { useLotteryState } from './useLotteryState';
import './offseason.css';

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
  const teamOf = (id: string) => {
    const t = state.teams.teams.find(x => x.teamId === id);
    return t ? <TeamName team={t} season={state.season} /> : id;
  };
  const title = <PageHeader kicker="Offseason" title={`S${state.season + 1} Draft Lottery`} />;

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
      <section className="stack">
        {title}
        {preview?.ok ? (
          <div className="card">
            <h2>Pick 1 odds</h2>
            <div className="table-wrap"><table className="stat-table">
              <thead><tr><th className="rank">Slot</th><th>Team</th><th>W-L</th><th className="num">Pick 1 odds</th></tr></thead>
              <tbody>
                {preview.odds.map(o => (
                  <tr key={o.teamId}>
                    <td className="rank">{o.slot}</td><td>{teamOf(o.teamId)}</td><td>{o.w}-{o.l}</td>
                    <td className="num">
                      <span className="odds">
                        <span className="odds-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, o.pct * 5)}%` }} /></span>
                        <span>{o.pct.toFixed(1)}%</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        ) : preview && <p className="error">{preview.problem}</p>}
        <div className="card toolbar">
          <button className="btn primary" disabled={saving || Boolean(refusal)} onClick={() => run(state)}>Run lottery</button>
          {problem && <span className="muted">{problem}</span>}
        </div>
        {actionError && <p className="error">{actionError}</p>}
      </section>
    );
  }

  const size = doc.lottery.length;
  const shown = Math.min(revealed ?? size, size);
  const done = shown >= size;
  const nowSlot = done ? null : size - shown;
  return (
    <section className="stack">
      {title}
      <div className="card">
        <h2>Lottery</h2>
        <ol className="order-list" reversed start={size} aria-label="Lottery">
          {doc.lottery.map((teamId, i) => ({ teamId, slot: i + 1 })).reverse().map(({ teamId, slot }) => (
            <li key={slot} className={slot === nowSlot ? 'now' : slot > size - shown ? 'done' : ''}>
              <strong className="order-num">{slot}</strong>
              {slot > size - shown ? teamOf(teamId) : <span>?</span>}
              <span className="pick-badges">{slot === nowSlot && <Badge kind="current">Next</Badge>}</span>
            </li>
          ))}
        </ol>
        {!done && (
          <p className="toolbar">
            <button className="btn" onClick={() => setRevealed(shown + 1)}>Reveal next</button>{' '}
            <button className="btn" onClick={() => setRevealed(size)}>Reveal all</button>
          </p>
        )}
      </div>
      {done && (
        <div className="card">
          <h2>Full S{doc.draftSeason} draft order</h2>
          <div className="table-wrap tall"><table className="stat-table">
            <thead><tr><th className="rank">Slot</th><th>Team</th><th>Via</th><th>Flag</th></tr></thead>
            <tbody>
              {doc.picks.map(p => (
                <tr key={p.slot}>
                  <td className="rank">{p.slot}</td>
                  <td>{teamOf(p.owner)}</td>
                  <td>{p.owner === p.originalTeam ? '' : `via ${nameOf(p.originalTeam)}`}</td>
                  <td>{p.flag ? <Badge kind="eliminated">{p.flag}</Badge> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {doc.picks.some(p => p.flag) && <p className="muted">Settle flagged picks by hand in the picks editor.</p>}
        </div>
      )}
    </section>
  );
}
