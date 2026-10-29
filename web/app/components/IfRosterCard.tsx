import { ifRoster } from '../../engine/roster/ifRoster';
import type { SignInput } from '../../engine/roster/moves';
import { openPositions } from '../../engine/roster/market';
import type { RosterState } from '../../engine/roster/state';
import type { SeasonPhase } from '../../engine/season/locks';
import { PayrollBar } from './PayrollBar';
import { PlayerName } from './PlayerName';

/** The roster a team would have if it signed the player on the terms typed in the sign panel, with the new player marked and the cap and open spots after. */
export function IfRosterCard({ state, input, teamName, phase }: { state: RosterState; input: SignInput; teamName: string; phase?: SeasonPhase }) {
  const view = ifRoster(state, input, phase);
  if (!view) return null;
  const name = (id: string) => state.players.players[id]?.name ?? 'Unnamed';
  const open = openPositions(view.entries);
  return (
    <section className="card" aria-label={`${teamName} if ${name(input.playerId)} signs`}>
      <h3>If {teamName} signs {name(input.playerId)}</h3>
      <div className="table-wrap">
        <table className="stat-table" aria-label="Roster if signed">
          <thead><tr><th>Pos</th><th>Player</th><th className="num">Rating</th><th className="num">Age</th><th>Contract</th></tr></thead>
          <tbody>
            {[...view.entries].sort((a, b) => ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(a.position) - ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(b.position)).map(e => (
              <tr key={e.playerId} className={e.playerId === view.newId ? 'selected' : undefined}>
                <td>{e.position}</td>
                <td><PlayerName id={e.playerId} name={name(e.playerId!)} />{e.playerId === view.newId && <strong> (new)</strong>}</td>
                <td className="num">{e.rating ?? '—'}</td>
                <td className="num">{e.age ?? '—'}</td>
                <td>{e.contractAmount != null && e.contractEnd != null ? `$${e.contractAmount} thru S${e.contractEnd}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.leaving.length > 0 && <p className="muted">Out: {view.leaving.map(e => `${e.position} ${name(e.playerId!)}`).join(', ')}</p>}
      <p className="muted">Open after: {open.length ? open.join(', ') : 'none'}</p>
      <PayrollBar total={view.payroll} />
      {!view.ok && <p className="muted">Not allowed as typed: {view.problems.join('; ')}</p>}
    </section>
  );
}
