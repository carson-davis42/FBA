import { useMemo } from 'react';
import { interestedTeams, WEIGHTS, type InterestScore } from '../../engine/roster/interest';
import type { RosterState } from '../../engine/roster/state';
import type { Team } from '../../engine/shared/types';
import { interestOptions, type InterestContext } from './interestOptions';
import { PlayerName } from './PlayerName';
import { TeamName } from './TeamName';

export const breakdown = (s: InterestScore, seasonsWith: number): string =>
  `Strength ${s.strength}/${WEIGHTS.strength} · Filled spots ${s.filled}/${WEIGHTS.filled} · Region ${s.region}/${WEIGHTS.region} · Played here ${s.history}/${WEIGHTS.history}${seasonsWith ? ` (${seasonsWith} seasons)` : ''}${s.ownTeam ? ` · Own team +${s.ownTeam}` : ''}`;

/**
 * Every team that would be interested in a market player (see interestedTeams), best fits first, with the score behind each rank and a button
 * to see the roster with him. The college region and past seasons with each team come from his bio and the franchise list.
 */
export function InterestedTeams({ state, teams, playerId, onSign, context }: {
  state: RosterState; teams: Team[]; playerId: string; onSign: (teamId: string) => void;
  /** The documents behind the profile, loaded once by the page (a document load counts as a save in flight, so they are not loaded here). */
  context: InterestContext;
}) {
  const options = useMemo(() => interestOptions(context, playerId, state.season), [context, playerId, state.season]);
  const rows = interestedTeams(state, playerId, options);
  const name = state.players.players[playerId]?.name ?? 'Unnamed';
  return (
    <section className="card" aria-label={`Teams interested in ${name}`}>
      <h3>Interested teams ({rows.length})</h3>
      <p className="muted">
        Ranked by a score: team strength, filled spots (up to 4), his college's region, seasons he played here, and a boost for his own team.
        Hover a score for the breakdown.
      </p>
      {rows.length === 0
        ? <p className="muted">No team has a need for {name}.</p>
        : (
          <div className="table-wrap">
            <table className="stat-table" aria-label="Interested teams">
              <thead><tr><th className="rank">#</th><th>Team</th><th className="num">Score</th><th className="num">Strength</th><th>Why</th><th className="num">Cap room</th><th className="num">Max offer</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const team = teams.find(t => t.teamId === r.teamId);
                  return (
                    <tr key={r.teamId} onClick={() => onSign(r.teamId)} className="clickable">
                      <td className="rank">{i + 1}</td>
                      <td>{team ? <TeamName team={team} season={state.season} /> : r.teamId}</td>
                      <td className="num" title={breakdown(r.score, r.seasonsWith)}>{r.score.total}</td>
                      <td className="num">{r.strength} of {Object.keys(state.fba.teams).length}</td>
                      <td>
                        {r.reason === 'resign' && 'His own team; the contract has ended'}
                        {r.reason === 'need' && 'Nobody at his position'}
                        {r.reason === 'upgrade' && r.holder && <>Upgrade on <PlayerName id={r.holder.playerId} name={r.holder.name} /> ({r.holder.rating})</>}
                        {r.seasonsWith > 0 && <span className="muted"> · played here {r.seasonsWith} {r.seasonsWith === 1 ? 'season' : 'seasons'}</span>}
                      </td>
                      <td className="num">${r.room}</td>
                      <td className="num" title={r.ask === null ? undefined : `A typical contract costs about $${r.ask}`}>{r.maxOffer > 0 ? `$${r.maxOffer}` : <span className="muted">None</span>}</td>
                      <td><button className="btn" onClick={ev => { ev.stopPropagation(); onSign(r.teamId); }}>See roster with {team?.abbr ?? r.teamId}</button></td>
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
