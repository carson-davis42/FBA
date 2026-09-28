import { useState } from 'react';
import { asgAvailable, asgNeeds, asgOnClock, asgPick, asgTeams, startAsgDraft } from '../../engine/allstar/asgDraft';
import type { StepProps } from './types';

export function AsgDraftStep({ doc, list, readOnly, saving, save }: StepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? id;
  const pos = (id: string) => list.find(p => p.playerId === id)?.position ?? '';
  if (!doc.asgDraft) {
    return (
      <div>
        <p className="muted">A coin flip decides which captain picks first; then they alternate. Each team's first 4 picks plus its captain must cover every position.</p>
        {!readOnly && <button className="btn primary" disabled={saving} onClick={() => save(startAsgDraft(doc, Math.random))}>Coin flip</button>}
      </div>
    );
  }
  const teams = asgTeams(doc);
  const clock = asgOnClock(doc);
  const available = asgAvailable(doc, list);
  const chosen = available.find(p => p.playerId === selected);
  const captainName = (t: 0 | 1) => name(teams[t][0]);
  return (
    <div className="live-grid">
      <div>
        {([0, 1] as const).map(t => (
          <div key={t} className="card">
            <h3>Team {captainName(t)}{clock === t ? ' · on the clock' : ''}</h3>
            <table><tbody>
              {teams[t].map((id, k) => <tr key={id}><td>{k === 0 ? 'C' : k}</td><td>{name(id)}{k < 5 ? ' · starter' : ''}</td><td>{pos(id)}</td></tr>)}
            </tbody></table>
          </div>
        ))}
      </div>
      {clock !== null && !readOnly ? (
        <div className="card">
          <h3>Available · Team {captainName(clock)}{asgNeeds(doc, clock, list).length ? ` needs ${asgNeeds(doc, clock, list).join('/')}` : ''}</h3>
          <table className="market" aria-label="Available All-Stars">
            <thead><tr><th>Player</th><th>Pos</th><th>Team</th><th className="n">Rtg</th></tr></thead>
            <tbody>
              {available.map(p => (
                <tr key={p.playerId} className={p.playerId === selected ? 'selected' : undefined} onClick={() => setSelected(p.playerId)}>
                  <td>{p.name}</td><td>{p.position}</td><td>{p.teamId}</td><td className="n">{p.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {chosen && (
            <button className="btn primary" disabled={saving} onClick={async () => { if (await save(asgPick(doc, chosen.playerId, list))) setSelected(null); }}>
              Pick {chosen.name} → Team {captainName(clock)}
            </button>
          )}
        </div>
      ) : <p className="muted">The All-Star draft is complete.</p>}
    </div>
  );
}
