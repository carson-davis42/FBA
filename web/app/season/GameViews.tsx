import { playerName, type SeasonState } from '../../engine/season/state';
import type { GameResult } from '../../engine/shared/types';

export const periodName = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);

export function LineScore({ home, away, periods }: { home: string; away: string; periods: { home: number[]; away: number[] } }) {
  return (
    <table className="line-score">
      <thead><tr><th></th>{periods.home.map((_, i) => <th key={i} className="n">{periodName(i + 1)}</th>)}<th className="n">T</th></tr></thead>
      <tbody>
        <tr><td>{away}</td>{periods.away.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n">{periods.away.reduce((a, b) => a + b, 0)}</td></tr>
        <tr><td>{home}</td>{periods.home.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n">{periods.home.reduce((a, b) => a + b, 0)}</td></tr>
      </tbody>
    </table>
  );
}

export function BoxTable({ state, title, lines }: { state: SeasonState; title: string; lines: { playerId: string; pts: number }[] }) {
  return (
    <table className="box-score">
      <thead><tr><th>{title}</th><th className="n">PTS</th></tr></thead>
      <tbody>{lines.map(l => <tr key={l.playerId}><td>{playerName(state, l.playerId)}</td><td className="n">{l.pts}</td></tr>)}</tbody>
    </table>
  );
}

export function FinalView({ state, r }: { state: SeasonState; r: GameResult }) {
  return (
    <section>
      <h1>Final{r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}: {r.away} {r.awayPts} @ {r.home} {r.homePts}</h1>
      {r.periods && <LineScore home={r.home} away={r.away} periods={r.periods} />}
      {r.box && (
        <div className="live-grid">
          <BoxTable state={state} title={r.away} lines={r.box.away} />
          <BoxTable state={state} title={r.home} lines={r.box.home} />
        </div>
      )}
    </section>
  );
}
