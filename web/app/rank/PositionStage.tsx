import { useState } from 'react';
import {
  positionList, positionUnranked, sendBackAtPosition, takeAtPosition, takeRestAtPosition,
} from '../../engine/rank/positionRanking';
import type { NameOf } from '../../engine/rank/ranking';
import { POSITIONS } from '../../engine/roster/rules';
import type { Position, RankingFile, RankingRow } from '../../engine/shared/types';
import { PlayerName } from '../components/PlayerName';
import '../pages/roster.css';
import './rank.css';

/**
 * Step 1 of the class ranking: rank each position on its own, best first. Once everyone is placed the whole ranking is built from these
 * lists (the best remaining player at each position is always the next one on offer).
 */
export function PositionStage({ doc, name, teamLabel, onChange }: {
  doc: RankingFile;
  name: NameOf;
  teamLabel: (team: string | null, row?: RankingRow) => string;
  onChange: (change: (current: RankingFile) => RankingFile) => void;
}) {
  const [pos, setPos] = useState<Position>('PG');
  const rowOf = new Map(doc.rows.map(r => [r.playerId, r]));
  const total = (p: Position) => doc.rows.filter(r => r.position === p).length;
  const placed = POSITIONS.reduce((n, p) => n + positionList(doc, p).length, 0);
  const left = positionUnranked(doc, name, pos);
  const ranked = positionList(doc, pos);
  const prev = (r: RankingRow) => r.prevRating ?? '—';
  return (
    <div className="rank stack">
      <div className="card">
        <p className="muted">Step 1 of 2: rank each position on its own, best first. {placed} of {doc.rows.length} placed. Then the whole ranking is built from these lists.</p>
        <div className="chips" role="group" aria-label="Position">
          {POSITIONS.map(p => (
            <button key={p} type="button" className={`chip${pos === p ? ' on' : ''}`} aria-pressed={pos === p} onClick={() => setPos(p)}>
              {p} {positionList(doc, p).length}/{total(p)}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => onChange(cur => takeRestAtPosition(cur, name))}>Place everyone left, in order</button>
        </div>
      </div>
      <div className="rank-cols">
        <div className="rank-col card">
          <div className="toolbar rank-head">
            <h3>{pos} not ranked · {left.length}</h3>
            {left.length > 0 && <button type="button" className="btn" onClick={() => onChange(cur => takeRestAtPosition(cur, name, pos))}>Take the rest in order</button>}
          </div>
          <div className="table-wrap">
            <table className="stat-table rank-table" aria-label={`${pos} not ranked`}>
              <thead><tr><th className="rank">#</th><th>Player</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th></tr></thead>
              <tbody>
                {left.map((r, i) => (
                  <tr key={r.playerId} className="rank-take" onClick={() => onChange(cur => takeAtPosition(cur, r.playerId))}>
                    <td className="rank">{i + 1}</td>
                    <td><button type="button" className="rank-name" aria-label={`Rank ${name(r.playerId)} next at ${pos}`}>{name(r.playerId)}</button></td>
                    <td className="n">{r.age ?? '—'}</td>
                    <td>{teamLabel(r.team, r)}</td>
                    <td className="n">{prev(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rank-col card">
          <div className="toolbar rank-head"><h3>{pos} ranking · {ranked.length}</h3></div>
          <div className="table-wrap">
            <table className="stat-table rank-table" aria-label={`${pos} ranking`}>
              <thead><tr><th className="rank">#</th><th>Player</th><th className="n">Age</th><th>Team</th><th><span className="muted">Back</span></th></tr></thead>
              <tbody>
                {ranked.map((id, i) => {
                  const r = rowOf.get(id)!;
                  return (
                    <tr key={id}>
                      <td className="rank">{i + 1}</td>
                      <td><PlayerName id={id} name={name(id)} /></td>
                      <td className="n">{r.age ?? '—'}</td>
                      <td>{teamLabel(r.team, r)}</td>
                      <td><button type="button" className="btn" aria-label={`Send ${name(id)} back`} onClick={() => onChange(cur => sendBackAtPosition(cur, id))}>↩</button></td>
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
