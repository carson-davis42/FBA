import { interestedTeams } from '../../engine/roster/interest';
import type { RosterState } from '../../engine/roster/state';
import type { Team } from '../../engine/shared/types';
import { TeamName } from './TeamName';
import { PlayerName } from './PlayerName';

/** Every team that would be interested in a market player (see interestedTeams), best fits first, with a button to sign him with it. */
export function InterestedTeams({ state, teams, playerId, onSign }: {
  state: RosterState; teams: Team[]; playerId: string; onSign: (teamId: string) => void;
}) {
  const rows = interestedTeams(state, playerId);
  const name = state.players.players[playerId]?.name ?? 'Unnamed';
  return (
    <section className="card" aria-label={`Teams interested in ${name}`}>
      <h3>Interested teams ({rows.length})</h3>
      {rows.length === 0
        ? <p className="muted">No team has the cap room and the need for {name}.</p>
        : (
          <div className="table-wrap">
            <table className="stat-table" aria-label="Interested teams">
              <thead><tr><th>Team</th><th>Why</th><th className="num">Cap room</th><th>Fit</th><th /></tr></thead>
              <tbody>
                {rows.map(r => {
                  const team = teams.find(t => t.teamId === r.teamId);
                  return (
                    <tr key={r.teamId}>
                      <td>{team ? <TeamName team={team} season={state.season} /> : r.teamId}</td>
                      <td>
                        {r.reason === 'resign' && 'His own team; the contract has ended'}
                        {r.reason === 'need' && 'Nobody at his position'}
                        {r.reason === 'upgrade' && r.holder && <>Upgrade on <PlayerName id={r.holder.playerId} name={r.holder.name} /> ({r.holder.rating})</>}
                      </td>
                      <td className="num">${r.room}</td>
                      <td>{r.ask === null ? <span className="muted">No FBA rating yet</span> : r.affordable ? `Fits about $${r.ask}` : <span className="muted">Short of about ${r.ask}</span>}</td>
                      <td><button className="btn" onClick={() => onSign(r.teamId)}>Sign with {team?.abbr ?? r.teamId}</button></td>
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
