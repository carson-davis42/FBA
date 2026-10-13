import { useMemo } from 'react';
import { lotteryProjection } from '../../engine/offseason/lotteryProjection';
import type { LotteryFile, Team } from '../../engine/shared/types';
import { Badge } from '../components/Badge';
import { TeamName } from '../components/TeamName';

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

/** A change in percentage points (or places): up is good news. */
function change(delta: number, digits: number, sign: boolean): { text: string; kind: 'up' | 'down' | 'flat' } {
  const rounded = Math.abs(delta).toFixed(digits);
  if (Number(rounded) === 0) return { text: '—', kind: 'flat' };
  return delta > 0
    ? { text: `▲ ${sign ? '+' : ''}${rounded}`, kind: 'up' }
    : { text: `▼ ${sign ? '−' : ''}${rounded}`, kind: 'down' };
}

/** What the reveal still holds: exact odds for the hidden teams, then, once everything is shown, how each team moved. Read-only. */
export function LotteryStats({ doc, shown, teams }: { doc: LotteryFile; shown: number; teams: Team[] }) {
  const size = doc.lottery.length;
  const done = shown >= size;
  const byId = useMemo(() => new Map(teams.map(t => [t.teamId, t])), [teams]);
  const proj = useMemo(() => {
    if (done) return null;
    // The last pick is revealed first.
    const revealedNow = doc.lottery.slice(size - shown).reverse();
    const now = lotteryProjection(doc.odds, revealedNow);
    const prev = shown > 0 ? lotteryProjection(doc.odds, revealedNow.slice(0, -1)) : null;
    return { now, prev };
  }, [doc, shown, size, done]);

  const team = (id: string) => {
    const t = byId.get(id);
    return t
      ? <><TeamName team={t} season={doc.season} />{t.fromSeason === doc.draftSeason && <Badge kind="current">Expansion</Badge>}</>
      : id;
  };
  const abbr = (id: string) => byId.get(id)?.abbr ?? id;

  if (done || !proj) {
    const slotOf = new Map(doc.odds.map(o => [o.teamId, o]));
    return (
      <div className="card">
        <h2>Where teams landed</h2>
        <div className="table-wrap tall"><table className="stat-table" aria-label="Where teams landed">
          <thead><tr><th>Team</th><th className="num">Record slot</th><th className="num">Final pick</th><th className="num">Moved</th><th className="num">Pick 1 odds</th></tr></thead>
          <tbody>
            {doc.lottery.map((teamId, i) => {
              const o = slotOf.get(teamId);
              const move = o ? change(o.slot - (i + 1), 0, false) : { text: '—', kind: 'flat' as const };
              return (
                <tr key={teamId}>
                  <td>{team(teamId)}</td>
                  <td className="num">{o?.slot ?? ''}</td>
                  <td className="num">{i + 1}</td>
                  <td className={`num move-${move.kind}`}>{move.text}</td>
                  <td className="num">{o ? `${o.pct.toFixed(1)}%` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    );
  }

  const { now, prev } = proj;
  const left = now.hidden.length;
  const favourite = now.hidden[0];
  const startOf = new Map(doc.odds.map(o => [o.teamId, o.pct]));
  const prevFirst = new Map((prev?.hidden ?? []).map(t => [t.teamId, t.pFirst]));
  return (
    <div className="card">
      <h2>Odds as it unfolds</h2>
      <p className="muted">
        {left} {left === 1 ? 'team' : 'teams'} left · picks 1–{left} still to reveal
        {favourite && <> · favourite for #1: {abbr(favourite.teamId)} {pct(favourite.pFirst)}</>}
      </p>
      <div className="table-wrap"><table className="stat-table" aria-label="Odds for the teams still hidden">
        <thead><tr>
          <th>Team</th><th className="num">Start</th><th className="num">Now</th><th className="num">Change</th>
          <th className="num">Expected</th><th className="num">Most likely</th><th className="num">Range</th>
        </tr></thead>
        <tbody>
          {now.hidden.map(t => {
            const before = prevFirst.get(t.teamId);
            const d = before === undefined ? { text: '—', kind: 'flat' as const } : change((t.pFirst - before) * 100, 1, true);
            return (
              <tr key={t.teamId}>
                <td>{team(t.teamId)}</td>
                <td className="num">{(startOf.get(t.teamId) ?? 0).toFixed(1)}%</td>
                <td className="num">{pct(t.pFirst)}</td>
                <td className={`num move-${d.kind}`}>{d.text}</td>
                <td className="num">{t.expected.toFixed(1)}</td>
                <td className="num">#{t.likely.pick} ({pct(t.likely.p)})</td>
                <td className="num">{t.best === t.worst ? t.best : `${t.best}–${t.worst}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <h3>Projected for each pick</h3>
      <div className="table-wrap"><table className="stat-table" aria-label="Projected team for each pick">
        <thead><tr><th className="rank">Pick</th><th>Most likely teams</th></tr></thead>
        <tbody>
          {now.perPick.map(r => (
            <tr key={r.pick}>
              <td className="rank">#{r.pick}</td>
              <td>{r.top.map((t, i) => <span key={t.teamId}>{i > 0 && ', '}{abbr(t.teamId)} {pct(t.p)}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
