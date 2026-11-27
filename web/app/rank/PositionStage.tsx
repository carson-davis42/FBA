import { Fragment, useState, type ReactNode } from 'react';
import {
  moveAtPosition, placesAt, positionList, positionUnranked, sendBackAtPosition, takeAtPosition, takeRestAtPosition,
} from '../../engine/rank/positionRanking';
import { isNewRow, type NameOf } from '../../engine/rank/ranking';
import { POSITIONS } from '../../engine/roster/rules';
import type { Position, RankingFile, RankingRow } from '../../engine/shared/types';
import { PlayerName } from '../components/PlayerName';
import '../pages/roster.css';
import './rank.css';

/**
 * The position step: rank each position on its own, best first. The whole ranking is then built from these lists (the best remaining
 * player at each position is always the next one on offer).
 *
 * The D2 reset (`doc.kind === 'd2-reset'`) ranks only each position's spots: a full position takes nobody else, and whoever is left is
 * headed to Reserves. Its lists have up/down buttons, and players already in the whole ranking stay put.
 */
export function PositionStage({ doc, name, teamLabel, onChange, header }: {
  doc: RankingFile;
  name: NameOf;
  teamLabel: (team: string | null, row?: RankingRow) => string;
  onChange: (change: (current: RankingFile) => RankingFile) => void;
  /** Replaces the class ranking's explanation above the position buttons. */
  header?: ReactNode;
}) {
  const [pos, setPos] = useState<Position>('PG');
  const d2 = doc.kind === 'd2-reset';
  const rowOf = new Map(doc.rows.map(r => [r.playerId, r]));
  const placed = POSITIONS.reduce((n, p) => n + positionList(doc, p).length, 0);
  const left = positionUnranked(doc, name, pos);
  const ranked = positionList(doc, pos);
  const full = ranked.length >= placesAt(doc, pos);
  const bestNew = d2 && !full ? left.find(r => isNewRow(doc, r)) : undefined;
  const firstNew = d2 ? left.find(r => isNewRow(doc, r)) : undefined;
  const prev = (r: RankingRow) => r.prevRating ?? (d2 && r.otherRating !== null ? <span className="muted">FBA {r.otherRating}</span> : '—');
  const leftHead = <tr><th className="rank">#</th><th>Player</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th>{d2 && <th>Stat</th>}</tr>;
  const leftRow = (r: RankingRow, i: number, label = `Rank ${name(r.playerId)} next at ${pos}`) => (
    <tr key={r.playerId} className={full ? undefined : 'rank-take'} onClick={full ? undefined : () => onChange(cur => takeAtPosition(cur, r.playerId))}>
      <td className="rank">{i + 1}</td>
      <td><button type="button" className="rank-name" disabled={full} aria-label={label}>{name(r.playerId)}</button></td>
      <td className="n">{r.age ?? '—'}</td>
      <td>{teamLabel(r.team, r)}</td>
      <td className="n">{prev(r)}</td>
      {d2 && <td>{r.stat ?? ''}</td>}
    </tr>
  );
  return (
    <div className="rank stack">
      <div className="card">
        {header ?? <p className="muted">Step 1 of 2: rank each position on its own, best first. {placed} of {doc.rows.length} placed. Then the whole ranking is built from these lists.</p>}
        <div className="chips" role="group" aria-label="Position">
          {POSITIONS.map(p => (
            <button key={p} type="button" className={`chip${pos === p ? ' on' : ''}`} aria-pressed={pos === p} onClick={() => setPos(p)}>
              {p} {positionList(doc, p).length}/{placesAt(doc, p)}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => onChange(cur => takeRestAtPosition(cur, name))}>{d2 ? 'Fill every position, in order' : 'Place everyone left, in order'}</button>
        </div>
      </div>
      <div className="rank-cols">
        <div className="rank-col card">
          <div className="toolbar rank-head">
            <h3>{d2 && full ? `${pos} full · ${left.length} headed to Reserves` : `${pos} not ranked · ${left.length}`}</h3>
            {left.length > 0 && !full && (
              <button type="button" className="btn" onClick={() => onChange(cur => takeRestAtPosition(cur, name, pos))}>{d2 ? 'Fill the rest in order' : 'Take the rest in order'}</button>
            )}
          </div>
          {bestNew && (
            <div className="rank-best">
              <h4>Best new {pos}</h4>
              <div className="table-wrap">
                <table className="stat-table rank-table" aria-label={`Best new ${pos}`}>
                  <thead>{leftHead}</thead>
                  <tbody>{leftRow(bestNew, 0, `Rank ${name(bestNew.playerId)} next at ${pos} (best new)`)}</tbody>
                </table>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table className="stat-table rank-table" aria-label={`${pos} not ranked`}>
              <thead>{leftHead}</thead>
              <tbody>
                {left.map((r, i) => (
                  <Fragment key={r.playerId}>
                    {r === firstNew && <tr className="rank-divider"><td colSpan={6}>New</td></tr>}
                    {leftRow(r, i)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rank-col card">
          <div className="toolbar rank-head"><h3>{pos} ranking · {d2 ? `${ranked.length} of ${placesAt(doc, pos)}` : ranked.length}</h3></div>
          <div className="table-wrap">
            <table className="stat-table rank-table" aria-label={`${pos} ranking`}>
              <thead><tr><th className="rank">#</th><th>Player</th><th className="n">Age</th><th>Team</th>{d2 && <th className="n">Prev</th>}<th><span className="muted">{d2 ? 'Move' : 'Back'}</span></th></tr></thead>
              <tbody>
                {ranked.map((id, i) => {
                  const r = rowOf.get(id)!;
                  const at = doc.order.indexOf(id);
                  return (
                    <tr key={id}>
                      <td className="rank">{i + 1}</td>
                      <td><PlayerName id={id} name={name(id)} /></td>
                      <td className="n">{r.age ?? '—'}</td>
                      <td>{teamLabel(r.team, r)}</td>
                      {d2 && <td className="n">{prev(r)}</td>}
                      <td className="rank-move">
                        {at >= 0 ? <span className="muted">#{at + 1} overall</span> : (
                          <>
                            {d2 && (
                              <>
                                <button type="button" className="btn" disabled={i === 0 || doc.order.includes(ranked[i - 1])} aria-label={`Move ${name(id)} up`} onClick={() => onChange(cur => moveAtPosition(cur, id, -1))}>↑</button>
                                <button type="button" className="btn" disabled={i === ranked.length - 1} aria-label={`Move ${name(id)} down`} onClick={() => onChange(cur => moveAtPosition(cur, id, 1))}>↓</button>
                              </>
                            )}
                            <button type="button" className="btn" aria-label={`Send ${name(id)} back`} onClick={() => onChange(cur => sendBackAtPosition(cur, id))}>↩</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
