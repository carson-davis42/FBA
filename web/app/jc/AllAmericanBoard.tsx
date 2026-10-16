import { useState, type ReactNode } from 'react';
import type { AllAmericanSuggestion } from '../../engine/jc/awards';
import { JC_ALL_AMERICAN_SLOTS, type JcAwardsFile, type Position } from '../../engine/shared/types';
import { PlayerName } from '../components/PlayerName';
import { pickableRow } from '../components/pickableRow';

const SLOT_POSITIONS: Record<string, Position[]> = { G: ['PG', 'SG'], F: ['SF', 'PF'], C: ['C'], ANY: ['PG', 'SG', 'SF', 'PF', 'C'] };
const SHOWN = 25;
type Team = 1 | 2 | 3;

/**
 * The three All-American teams as a board: each slot shows who is picked, and clicking a slot opens the ranked suggestions for it
 * with the award score and where it comes from. Picking moves on to the next empty slot.
 */
export function AllAmericanBoard({ awards, suggestions, disabled, who, teamCell, onPick }: {
  awards: NonNullable<JcAwardsFile['allAmerican']>;
  suggestions: AllAmericanSuggestion[];
  disabled: boolean;
  who: (playerId: string, teamId: string | null) => string;
  teamCell: (teamId: string) => ReactNode;
  onPick: (team: Team, slotIndex: number, playerId: string | null) => void;
}) {
  const [selected, setSelected] = useState<{ team: Team; k: number } | null>(null);
  const byId = new Map(suggestions.map(s => [s.playerId, s]));
  const placed = new Map<string, string>();
  for (const t of awards) t.slots.forEach((s, k) => { if (s.playerId) placed.set(s.playerId, `Team ${t.team} ${JC_ALL_AMERICAN_SLOTS[k]}`); });

  const nextEmpty = (from: { team: Team; k: number }): { team: Team; k: number } | null => {
    const order = awards.flatMap(t => t.slots.map((s, k) => ({ team: t.team as Team, k, empty: s.playerId === null })));
    const start = order.findIndex(o => o.team === from.team && o.k === from.k);
    return order.slice(start + 1).find(o => o.empty) ?? null;
  };
  const choose = (playerId: string): void => {
    if (!selected) return;
    onPick(selected.team, selected.k, playerId);
    setSelected(nextEmpty(selected) ? { team: nextEmpty(selected)!.team, k: nextEmpty(selected)!.k } : null);
  };

  const slot = selected ? JC_ALL_AMERICAN_SLOTS[selected.k] : null;
  const rows = slot ? suggestions.filter(s => SLOT_POSITIONS[slot].includes(s.position)).slice(0, SHOWN) : [];
  const why = (s: AllAmericanSuggestion): string => `score ${s.score.toFixed(1)} = ${s.parts.ppg.toFixed(1)} PPG + ${s.parts.rating.toFixed(1)} rtg + ${s.parts.team.toFixed(1)} team`;

  return (
    <div className="stack">
      <div className="jc-regions">
        {awards.map(t => (
          <div key={t.team} className="card jc-field">
            <h3>Team {t.team}</h3>
            <ul className="jc-aa-slots">
              {t.slots.map((s, k) => {
                const sel = selected?.team === t.team && selected.k === k;
                const p = s.playerId ? byId.get(s.playerId) : undefined;
                return (
                  <li key={k} className={sel ? 'jc-aa-slot jc-aa-selected' : 'jc-aa-slot'}>
                    <span className="jc-aa-pos">{JC_ALL_AMERICAN_SLOTS[k]}</span>
                    <span className="jc-aa-who">
                      {s.playerId
                        ? <><PlayerName id={s.playerId} name={who(s.playerId, p?.teamId ?? null)} />{p && <span className="muted"> {p.position} · {p.ppg.toFixed(1)} PPG · {p.rating} rtg · score {p.score.toFixed(1)}</span>}</>
                        : <span className="muted">Not picked</span>}
                    </span>
                    <button type="button" className="btn" disabled={disabled} aria-pressed={sel} aria-label={`Choose Team ${t.team} ${JC_ALL_AMERICAN_SLOTS[k]} ${k + 1}`}
                      onClick={() => setSelected(sel ? null : { team: t.team as Team, k })}>{s.playerId ? 'Change' : 'Pick'}</button>
                    {s.playerId && <button type="button" className="btn" disabled={disabled} aria-label={`Clear Team ${t.team} ${JC_ALL_AMERICAN_SLOTS[k]} ${k + 1}`}
                      onClick={() => onPick(t.team as Team, k, null)}>Clear</button>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="card jc-aa-panel">
        {!selected || !slot ? <p className="muted">Pick a slot to see the suggestions for it, best award score first.</p> : (
          <>
            <h3>Suggestions for Team {selected.team} {slot}</h3>
            <p className="muted">The award score over the regular season, conference tournaments and postseason: 40% points, 35% rating, 25% team success.</p>
            <div className="table-wrap">
              <table className="stat-table">
                <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th className="n">PPG</th><th className="n">Post PPG</th><th className="n">Rtg</th><th>Score</th><th>Odds</th></tr></thead>
                <tbody>
                  {rows.map((s, i) => {
                    const on = placed.get(s.playerId);
                    return (
                      <tr key={s.playerId} {...pickableRow(disabled || on ? null : () => choose(s.playerId), on ? 'muted' : '')}>
                        <td>{i + 1}</td>
                        <td><PlayerName id={s.playerId} name={who(s.playerId, s.teamId)} />{on && <span className="muted"> · on {on}</span>}</td>
                        <td>{teamCell(s.teamId)}</td>
                        <td>{s.position}</td>
                        <td className="n">{s.ppg.toFixed(1)}</td>
                        <td className="n">{s.tournamentPpg ? s.tournamentPpg.toFixed(1) : '–'}</td>
                        <td className="n">{s.rating}</td>
                        <td>{why(s)}</td>
                        <td>{s.odds}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
