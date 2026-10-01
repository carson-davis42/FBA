import { Fragment, useEffect, useState } from 'react';
import { applyClassSuggestions, consensusSuggestion, parseConsensusInput, starsFor } from '../../engine/college/classRanking';
import {
  applyAllSuggestions, bestNewByPosition, isNewRow, leftRows, clearRatings, outOfOrder, rankedRows, rankingBlockers, reserveBound, sendBack, setRating, suggestion, take, takeRest, type NameOf,
} from '../../engine/rank/ranking';
import { POSITIONS } from '../../engine/roster/rules';
import type { Position, RankingFile, RankingRow } from '../../engine/shared/types';
import { RatingInput } from '../components/RatingInput';
import '../pages/roster.css';
import '../offseason/offseason.css';
import './rank.css';

type Filter = 'ALL' | Position;

export interface RankingTableProps {
  doc: RankingFile;
  name: NameOf;
  /** How the Team column shows a row's team (null = no team, e.g. D2 Reserves). */
  teamLabel: (team: string | null, row?: RankingRow) => string;
  /** Short name of the league `otherRating` comes from, e.g. "FBA"; shown as "FBA 71" in the Prev column of new players. */
  otherLabel: string;
  /** Applies a change to the latest copy of the doc (e.g. useAutosaveDoc's update). */
  onChange: (change: (current: RankingFile) => RankingFile) => void;
  /** Heading of the not-yet-ranked list; default "Last season's order". */
  leftLabel?: string;
  /** Blockers from the caller (e.g. pool membership), listed after the ranking's own. */
  extraBlockers: string[];
  finishLabel: string;
  onFinish: () => void;
  /** True while a save is running: Finish is disabled. */
  busy: boolean;
  /** Class ranking only: shows a Consensus box (with stars and a suggestion chip) next to Rating; "Use all suggestions" fills consensus too. */
  /** D2 reset: roster spots per position (the pool cutoff). Shows how many are left as players are ranked; ranking past it puts a player in the Reserve pool. */
  positionCap?: { spots: number; label: string };
  consensus?: { onSet: (playerId: string, value: number | null) => void };
}

/** A consensus box that saves on blur (or Enter): blank clears it, otherwise 70 to 100 with up to 2 decimals. */
function ConsensusInput({ value, name, disabled, onSave }: { value: number | null; name: string; disabled: boolean; onSave: (value: number | null) => void }) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const [problem, setProblem] = useState('');
  useEffect(() => { setText(shown); }, [shown]);
  const commit = () => {
    const parsed = parseConsensusInput(text);
    if (!parsed.ok) {
      setProblem(parsed.problem);
      return;
    }
    setProblem('');
    if (parsed.value !== value) onSave(parsed.value);
  };
  return (
    <>
      <input
        className="rating-input" inputMode="decimal" aria-label={`Consensus for ${name}`} value={text} disabled={disabled}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      {problem && <div className="error inline-problem">{problem}</div>}
    </>
  );
}

/**
 * The click-to-rank screen. Left: players not ranked yet, in last season's order (a "New" divider above players new to
 * the league). Right: the new ranking. Rating boxes appear once everyone is ranked; each starts empty, with the
 * suggestion as a separate chip. The position filter is for reading only.
 */
export function RankingTable({ doc, name, teamLabel, otherLabel, leftLabel = "Last season's order", onChange, extraBlockers, finishLabel, onFinish, busy, consensus, positionCap }: RankingTableProps) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const locked = doc.locked;
  const shown = (r: RankingRow) => filter === 'ALL' || r.position === filter;
  // D2 reset: a position whose spots are all taken drops out of the unranked lists (and reappears if someone is sent back).
  const fullPositions = new Set(positionCap ? POSITIONS.filter(pos => rankedRows(doc).filter(r => r.position === pos).length >= positionCap.spots) : []);
  const shownLeft = (r: RankingRow) => shown(r) && !fullPositions.has(r.position);
  const left = leftRows(doc, name);
  const allPlaced = left.length === 0;
  // D2 reset: players ranked past their position's spots go to the Reserve pool; they show an X and need no rating.
  const reserve = positionCap ? reserveBound(doc, positionCap.spots) : new Set<string>();
  const flagged = outOfOrder(doc, reserve);
  const blockers = [...rankingBlockers(doc, name, reserve), ...extraBlockers];
  const prev = (r: RankingRow) => r.prevRating ?? (r.otherRating !== null ? <span className="muted">{otherLabel} {r.otherRating}</span> : '—');
  const existing = left.filter(r => !isNewRow(doc, r));
  const fresh = left.filter(r => isNewRow(doc, r));
  const [split, setSplit] = useState(false);
  // Offered while both groups exist; once switched on it stays on, even if a list empties.
  const canSplit = split || (existing.length > 0 && fresh.length > 0);
  let dividerShown = false;

  const leftHeadRow = <tr><th className="rank">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th><th>Stat</th></tr>;
  const leftRow = (r: RankingRow, i: number, buttonLabel = `Rank ${name(r.playerId)} next`) => (
    <tr key={r.playerId} className={locked ? undefined : 'rank-take'} onClick={locked ? undefined : () => onChange(cur => take(cur, r.playerId))}>
      <td className="rank">{i + 1}</td>
      <td>
        <button type="button" className="rank-name" disabled={locked} aria-label={buttonLabel}>{name(r.playerId)}</button>
      </td>
      <td>{r.position}</td>
      <td className="n">{r.age ?? '—'}</td>
      <td>{teamLabel(r.team, r)}</td>
      <td className="n">{prev(r)}</td>
      <td>{r.stat ?? ''}</td>
    </tr>
  );

  const leftTable = (rows: RankingRow[], label: string, divide: boolean) => (
    <div className="table-wrap">
      <table className="stat-table rank-table" aria-label={label}>
        <thead>{leftHeadRow}</thead>
        <tbody>
          {rows.map((r, i) => {
            if (!shownLeft(r)) return null;
            const divider = divide && isNewRow(doc, r) && !dividerShown;
            if (divider) dividerShown = true;
            return (
              <Fragment key={r.playerId}>
                {divider && <tr className="rank-divider"><td colSpan={7}>New</td></tr>}
                {leftRow(r, i)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const bestNew = bestNewByPosition(doc, name);
  const bestNewList = POSITIONS.map(pos => bestNew[pos]).filter((r): r is RankingRow => r !== undefined && !fullPositions.has(r.position));
  // A mini copy of the list above its scrolling table, so the best new player at each position stays in view however far the list is scrolled.
  const bestStrip = !locked && bestNewList.length > 0 && (
    <div className="rank-best">
      <h4>Best new at each position</h4>
      <div className="table-wrap">
        <table className="stat-table rank-table" aria-label="Best new at each position">
          <thead>{leftHeadRow}</thead>
          <tbody>{bestNewList.map((r, i) => leftRow(r, i, `Rank ${name(r.playerId)} next (best new ${r.position})`))}</tbody>
        </table>
      </div>
    </div>
  );
  const leftHead = (title: string, rows: RankingRow[], only?: (r: RankingRow) => boolean) => (
    <div className="toolbar rank-head">
      <h3>{title} · {rows.length}</h3>
      {!locked && rows.length > 0 && (
        <button type="button" className="btn" onClick={() => onChange(cur => takeRest(cur, name, only))}>Take the rest in order</button>
      )}
    </div>
  );

  return (
    <div className="rank stack">
      <div className="chips card" role="group" aria-label="Position filter">
        {(['ALL', ...POSITIONS] as Filter[]).map(f => (
          <button key={f} type="button" className={`chip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'ALL' ? 'All' : f}
          </button>
        ))}
        {canSplit && (
          <button type="button" className={`chip${split ? ' on' : ''}`} aria-pressed={split} onClick={() => setSplit(v => !v)}>Split view</button>
        )}
      </div>
      {positionCap && (
        <div className="chips card" role="group" aria-label={positionCap.label}>
          <span className="muted">{positionCap.label}</span>
          {POSITIONS.map(pos => {
            const taken = rankedRows(doc).filter(r => r.position === pos).length;
            const left = positionCap.spots - taken;
            return (
              <span key={pos} className={`chip rank-spots${left <= 0 ? ' full' : ''}`}>
                {pos} {Math.max(0, left)}{left < 0 ? ` (${-left} over)` : ''}
              </span>
            );
          })}
        </div>
      )}
      {fullPositions.size > 0 && (
        <p className="muted rank-full">
          {POSITIONS.filter(pos => fullPositions.has(pos)).map(pos => `${pos} full`).join(' · ')}: those players are hidden below; send someone back to see them again.
        </p>
      )}
      <div className={`rank-cols${split ? ' split' : ''}`}>
        {split ? (
          <>
            <div className="rank-col card">
              {leftHead('Already in the league', existing, r => !isNewRow(doc, r))}
              {leftTable(existing, 'Already in the league', false)}
            </div>
            <div className="rank-col card">
              {leftHead('New players', fresh, r => isNewRow(doc, r))}
              {bestStrip}
              {leftTable(fresh, 'New players', false)}
            </div>
          </>
        ) : (
          <div className="rank-col card">
            {leftHead(leftLabel, left)}
            {bestStrip}
            {leftTable(left, leftLabel, true)}
          </div>
        )}
        <div className="rank-col card">
          <div className="toolbar rank-head">
            <h3>New ranking · {doc.order.length}</h3>
            {!locked && allPlaced && (
              <div className="rank-actions">
                {Object.keys(doc.ratings).length > 0 && <button type="button" className="btn" onClick={() => onChange(clearRatings)}>Clear ratings</button>}
                <button type="button" className="btn" onClick={() => onChange(consensus ? applyClassSuggestions : cur => applyAllSuggestions(cur, positionCap ? reserveBound(cur, positionCap.spots) : undefined))}>Use all suggestions</button>
              </div>
            )}
          </div>
          {!locked && !allPlaced && doc.order.length > 0 && <p className="muted">Rating boxes appear once every player is ranked.</p>}
          <div className="table-wrap">
            <table className="stat-table rank-table" aria-label="New ranking">
              <thead>
                <tr>
                  <th className="rank">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th>
                  {allPlaced && <th>Rating</th>}
                  {allPlaced && consensus && <th>Consensus</th>}
                  {allPlaced && consensus && <th>Stars</th>}
                  <th><span className="muted">Back</span></th>
                </tr>
              </thead>
              <tbody>
                {rankedRows(doc).map((r, i) => {
                  if (!shown(r)) return null;
                  const s = suggestion(doc, i + 1);
                  const bad = flagged.has(r.playerId);
                  const c = doc.consensus?.[r.playerId] ?? null;
                  const cs = consensus ? consensusSuggestion(doc, i + 1) : null;
                  const stars = c === null ? null : starsFor(c);
                  return (
                    <tr key={r.playerId} className={bad ? 'out-of-order' : undefined}>
                      <td className="rank">{i + 1}</td>
                      <td>{name(r.playerId)}{bad && <span className="rank-flag" title="Rated above a player ranked higher">⚠</span>}</td>
                      <td>{r.position}</td>
                      <td className="n">{r.age ?? '—'}</td>
                      <td>{teamLabel(r.team, r)}</td>
                      <td className="n">{prev(r)}</td>
                      {allPlaced && reserve.has(r.playerId) && (
                        <td className="rank-rating"><span className="reserve-x" title="Goes to the Reserve pool, so no rating">X</span></td>
                      )}
                      {allPlaced && !reserve.has(r.playerId) && (
                        <td className="rank-rating">
                          <RatingInput
                            value={doc.ratings[r.playerId] ?? null} name={name(r.playerId)} disabled={locked} allowBlank
                            onSave={v => onChange(cur => setRating(cur, r.playerId, v))}
                          />
                          {s !== null && !locked && (
                            <button
                              type="button" className="suggest" aria-label={`Use suggested ${s} for ${name(r.playerId)}`}
                              onClick={() => onChange(cur => setRating(cur, r.playerId, s))}
                            >
                              suggested {s}
                            </button>
                          )}
                        </td>
                      )}
                      {allPlaced && consensus && (
                        <td className="rank-rating">
                          <ConsensusInput value={c} name={name(r.playerId)} disabled={locked} onSave={v => consensus.onSet(r.playerId, v)} />
                          {cs !== null && !locked && (
                            <button
                              type="button" className="suggest" aria-label={`Use suggested consensus ${cs} for ${name(r.playerId)}`}
                              onClick={() => consensus.onSet(r.playerId, cs)}
                            >
                              suggested {cs}
                            </button>
                          )}
                        </td>
                      )}
                      {allPlaced && consensus && (
                        <td>{stars !== null && <span aria-label={`${stars} stars`}>{'★'.repeat(stars)}</span>}</td>
                      )}
                      <td>
                        {!locked && (
                          <button type="button" className="btn" aria-label={`Send ${name(r.playerId)} back`} onClick={() => onChange(cur => sendBack(cur, r.playerId))}>↩</button>
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
      {!locked && blockers.length > 0 && <ul className="problems">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
      {!locked && (
        <div className="toolbar card">
          <button type="button" className="btn primary" disabled={busy || blockers.length > 0} onClick={onFinish}>{finishLabel}</button>
        </div>
      )}
    </div>
  );
}
