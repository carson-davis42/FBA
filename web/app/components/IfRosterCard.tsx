import { ifRoster } from '../../engine/roster/ifRoster';
import { WEIGHTS, type InterestedTeam } from '../../engine/roster/interest';
import type { SignInput } from '../../engine/roster/moves';
import { openPositions } from '../../engine/roster/market';
import type { RosterState } from '../../engine/roster/state';
import type { SeasonPhase } from '../../engine/season/locks';
import { PayrollBar } from './PayrollBar';
import { PlayerName } from './PlayerName';

/** The roster a team would have if it signed the player on the terms typed in the sign panel, with the new player marked and the cap and open spots after. */
export function IfRosterCard({ state, input, teamName, phase, fit }: {
  state: RosterState; input: SignInput; teamName: string; phase?: SeasonPhase;
  /** This team's row in the interested-teams ranking (null: it isn't on that list; undefined: not computed). */
  fit?: InterestedTeam | null;
}) {
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
            {view.leaving.map(e => (
              <tr key={`out-${e.playerId}`} className="muted" aria-label={`Out: ${name(e.playerId!)}`}>
                <td>{e.position}</td>
                <td><s><PlayerName id={e.playerId} name={name(e.playerId!)} /></s> <strong>(out)</strong></td>
                <td className="num">{e.rating ?? '—'}</td>
                <td className="num">{e.age ?? '—'}</td>
                <td>{e.contractAmount != null && e.contractEnd != null ? `$${e.contractAmount} thru S${e.contractEnd}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Open after: {open.length ? open.join(', ') : 'none'}</p>
      {fit !== undefined && (
        <div className="fit-breakdown" aria-label="Fit score">
          {fit
            ? (
              <>
                <strong>Fit score {fit.score.total}</strong>
                <ul className="plain-list tight">
                  <li>Team strength {fit.score.strength} / {WEIGHTS.strength}</li>
                  <li>Filled spots {fit.score.filled} / {WEIGHTS.filled}</li>
                  <li>College region {fit.score.region} / {WEIGHTS.region}</li>
                  <li>Played here {fit.score.history} / {WEIGHTS.history}{fit.seasonsWith > 0 ? ` (${fit.seasonsWith} ${fit.seasonsWith === 1 ? 'season' : 'seasons'})` : ''}</li>
                  {fit.score.ownTeam > 0 && <li>His own team +{fit.score.ownTeam}</li>}
                </ul>
              </>
            )
            : <p className="muted">Fit score: this team isn't on his interested list (it has no need for him).</p>}
        </div>
      )}
      <PayrollBar total={view.payroll} />
      {!view.ok && <p className="muted">Not allowed as typed: {view.problems.join('; ')}</p>}
    </section>
  );
}
