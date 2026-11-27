import { isExpired } from '../../engine/roster/rules';
import type { RosterState } from '../../engine/roster/state';
import type { Team } from '../../engine/shared/types';
import { PlayerName } from './PlayerName';
import { TeamName } from './TeamName';

/** Rookies whose restricted contracts have ended: only their own team can keep them (a team option), or it lets them go to the open market. */
export function RestrictedFreeAgents({ state, teams, teamId, busy, onResign, onLetGo }: {
  state: RosterState; teams: Team[]; teamId: string; busy: boolean;
  onResign: (teamId: string, playerId: string) => void;
  onLetGo: (teamId: string, playerId: string) => void;
}) {
  const rows = Object.entries(state.fba.teams)
    .flatMap(([t, entries]) => entries.filter(e => e.playerId !== null && e.restricted === true && isExpired(e, state.season) && (!teamId || t === teamId)).map(e => ({ teamId: t, e })))
    .sort((a, b) => (b.e.rating ?? -1) - (a.e.rating ?? -1));
  return (
    <section className="card" aria-label="Restricted free agents">
      <h3>Restricted free agents ({rows.length})</h3>
      <p className="muted">Rookies whose contracts have ended. Only their own team can re-sign them; if it doesn't, they go to the open market.</p>
      {rows.length === 0
        ? <p className="muted">No restricted free agents{teamId ? ' for this team' : ''}.</p>
        : (
          <div className="table-wrap">
            <table className="stat-table" aria-label="Restricted free agents list">
              <thead><tr><th>Pos</th><th>Player</th><th>Team</th><th className="num">Rating</th><th className="num">Age</th><th>Last contract</th><th /></tr></thead>
              <tbody>
                {rows.map(({ teamId: t, e }) => {
                  const team = teams.find(x => x.teamId === t);
                  const name = state.players.players[e.playerId!]?.name ?? 'Unnamed';
                  return (
                    <tr key={e.playerId}>
                      <td>{e.position}</td>
                      <td><PlayerName id={e.playerId} name={name} /></td>
                      <td>{team ? <TeamName team={team} season={state.season} variant="abbr" size={18} /> : t}</td>
                      <td className="num">{e.rating ?? '—'}</td>
                      <td className="num">{e.age ?? '—'}</td>
                      <td>{e.contractAmount != null && e.contractEnd != null ? `$${e.contractAmount} thru S${e.contractEnd}` : '—'}</td>
                      <td>
                        <button className="btn" disabled={busy} aria-label={`Re-sign ${name}`} onClick={() => onResign(t, e.playerId!)}>Re-sign</button>
                        {' '}
                        <button className="btn" disabled={busy} aria-label={`Let ${name} go`} onClick={() => onLetGo(t, e.playerId!)}>Let go</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}
