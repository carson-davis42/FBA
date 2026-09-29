import { Fragment, useState } from 'react';
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
}

/**
 * The click-to-rank screen. Left: players not ranked yet, in last season's order (a "New" divider above players new to
 * the league). Right: the new ranking. Rating boxes appear once everyone is ranked; each starts empty, with the
 * suggestion as a separate chip. The position filter is for reading only.
 */
export function RankingTable({ doc, name, teamLabel, otherLabel, onChange, extraBlockers, finishLabel, onFinish, busy }: RankingTableProps) {
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
              <button type="button" className="btn" onClick={() => onChange(applyAllSuggestions)}>Use all suggestions</button>
            )}
          </div>
          {!locked && !allPlaced && doc.order.length > 0 && <p className="muted">Rating boxes appear once every player is ranked.</p>}
          <div className="table-wrap">
            <table className="rank-table" aria-label="New ranking">
              <thead>
                <tr>
                  <th className="n">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th>
                  {allPlaced && <th>Rating</th>}
                  <th><span className="muted">Back</span></th>
                </tr>
              </thead>
              <tbody>
                {rankedRows(doc).map((r, i) => {
                  if (!shown(r)) return null;
                  const s = suggestion(doc, i + 1);
                  const bad = flagged.has(r.playerId);
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
