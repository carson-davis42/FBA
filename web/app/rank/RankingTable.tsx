import { Fragment, useEffect, useState } from 'react';
import { applyClassSuggestions, consensusSuggestion, parseConsensusInput, starsFor } from '../../engine/college/classRanking';
import {
  applyAllSuggestions, leftRows, outOfOrder, rankedRows, rankingBlockers, sendBack, setRating, suggestion, take, takeRest, type NameOf,
} from '../../engine/rank/ranking';
import { POSITIONS } from '../../engine/roster/rules';
import type { Position, RankingFile, RankingRow } from '../../engine/shared/types';
import { RatingInput } from '../components/RatingInput';
import '../pages/roster.css';
import './rank.css';

type Filter = 'ALL' | Position;

export interface RankingTableProps {
  doc: RankingFile;
  name: NameOf;
  /** How the Team column shows a row's team (null = no team, e.g. D2 Reserves). */
  teamLabel: (team: string | null) => string;
  /** Short name of the league `otherRating` comes from, e.g. "FBA"; shown as "FBA 71" in the Prev column of new players. */
  otherLabel: string;
  /** Applies a change to the latest copy of the doc (e.g. useAutosaveDoc's update). */
  onChange: (change: (current: RankingFile) => RankingFile) => void;
  /** Blockers from the caller (e.g. pool membership), listed after the ranking's own. */
  extraBlockers: string[];
  finishLabel: string;
  onFinish: () => void;
  /** True while a save is running: Finish is disabled. */
  busy: boolean;
  /** Class ranking only: shows a Consensus box (with stars and a suggestion chip) next to Rating; "Use all suggestions" fills consensus too. */
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
export function RankingTable({ doc, name, teamLabel, otherLabel, onChange, extraBlockers, finishLabel, onFinish, busy, consensus }: RankingTableProps) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const locked = doc.locked;
  const shown = (r: RankingRow) => filter === 'ALL' || r.position === filter;
  const left = leftRows(doc, name);
  const allPlaced = left.length === 0;
  const flagged = outOfOrder(doc);
  const blockers = [...rankingBlockers(doc, name), ...extraBlockers];
  const prev = (r: RankingRow) => r.prevRating ?? (r.otherRating !== null ? <span className="muted">{otherLabel} {r.otherRating}</span> : '—');
  let dividerShown = false;

  return (
    <div className="rank">
      <div className="chips" role="group" aria-label="Position filter">
        {(['ALL', ...POSITIONS] as Filter[]).map(f => (
          <button key={f} type="button" className={`chip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'ALL' ? 'All' : f}
          </button>
        ))}
      </div>
      <div className="rank-cols">
        <div className="rank-col">
          <div className="toolbar">
            <h3>Last season's order · {left.length}</h3>
            {!locked && left.length > 0 && (
              <button type="button" className="btn" onClick={() => onChange(cur => takeRest(cur, name))}>Take the rest in order</button>
            )}
          </div>
          <div className="table-wrap">
            <table className="rank-table" aria-label="Last season's order">
              <thead>
                <tr><th className="n">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th><th>Stat</th></tr>
              </thead>
              <tbody>
                {left.map((r, i) => {
                  if (!shown(r)) return null;
                  const divider = r.prevRating === null && !dividerShown;
                  if (divider) dividerShown = true;
                  return (
                    <Fragment key={r.playerId}>
                      {divider && <tr className="rank-divider"><td colSpan={7}>New</td></tr>}
                      <tr className={locked ? undefined : 'rank-take'} onClick={locked ? undefined : () => onChange(cur => take(cur, r.playerId))}>
                        <td className="n">{i + 1}</td>
                        <td>
                          <button type="button" className="rank-name" disabled={locked} aria-label={`Rank ${name(r.playerId)} next`}>{name(r.playerId)}</button>
                        </td>
                        <td>{r.position}</td>
                        <td className="n">{r.age ?? '—'}</td>
                        <td>{teamLabel(r.team)}</td>
                        <td className="n">{prev(r)}</td>
                        <td>{r.stat ?? ''}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rank-col">
          <div className="toolbar">
            <h3>New ranking · {doc.order.length}</h3>
            {!locked && allPlaced && (
              <button type="button" className="btn" onClick={() => onChange(consensus ? applyClassSuggestions : applyAllSuggestions)}>Use all suggestions</button>
            )}
          </div>
          {!locked && !allPlaced && doc.order.length > 0 && <p className="muted">Rating boxes appear once every player is ranked.</p>}
          <div className="table-wrap">
            <table className="rank-table" aria-label="New ranking">
              <thead>
                <tr>
                  <th className="n">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th>
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
                      <td className="n">{i + 1}</td>
                      <td>{name(r.playerId)}{bad && <span className="rank-flag" title="Rated above a player ranked higher">⚠</span>}</td>
                      <td>{r.position}</td>
                      <td className="n">{r.age ?? '—'}</td>
                      <td>{teamLabel(r.team)}</td>
                      <td className="n">{prev(r)}</td>
                      {allPlaced && (
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
        <div className="toolbar">
          <button type="button" className="btn primary" disabled={busy || blockers.length > 0} onClick={onFinish}>{finishLabel}</button>
        </div>
      )}
    </div>
  );
}
