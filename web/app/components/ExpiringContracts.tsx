import { extensionRoom, signedThisOffseason } from '../../engine/roster/moves';
import type { RosterState } from '../../engine/roster/state';
import type { Team } from '../../engine/shared/types';
import { PlayerName } from './PlayerName';
import { TeamName } from './TeamName';

/** Players on running contracts that end this season, so they reach free agency next year: the ones their teams may want to extend now. */
export function ExpiringContracts({ state, teams, teamId, passed, busy, onExtend, onPass }: {
  state: RosterState; teams: Team[]; teamId: string;
  /** Players whose teams decided not to extend them. */
  passed: Set<string>; busy: boolean;
  onExtend: (teamId: string, playerId: string) => void;
  /** Marks (or, with false, un-marks) a player as not being extended. */
  onPass: (playerId: string, pass: boolean) => void;
}) {
  const rows = Object.entries(state.fba.teams)
    .flatMap(([t, entries]) => entries.filter(e => e.playerId !== null && e.contractEnd === state.season && extensionRoom(state, e) > 0 && !signedThisOffseason(state, t, e) && (!teamId || t === teamId)).map(e => ({ teamId: t, e })))
    .sort((a, b) => Number(passed.has(a.e.playerId!)) - Number(passed.has(b.e.playerId!)) || (b.e.rating ?? -1) - (a.e.rating ?? -1));
  return (
    <section className="card" aria-label="Contracts ending this season">
      <h3>Contracts ending after S{state.season} ({rows.length})</h3>
      <p className="muted">These players reach free agency next year. A team can extend one now. Players in their last season before retiring (age 32) and players who signed a deal this offseason are left out.</p>
      {rows.length === 0
        ? <p className="muted">No contracts end after S{state.season}{teamId ? ' for this team' : ''}.</p>
        : (
          <div className="table-wrap tall">
            <table className="stat-table" aria-label="Expiring next year">
              <thead><tr><th>Pos</th><th>Player</th><th>Team</th><th className="num">Rating</th><th className="num">Age</th><th>Contract</th><th>Decision</th><th /></tr></thead>
              <tbody>
                {rows.map(({ teamId: t, e }) => {
                  const team = teams.find(x => x.teamId === t);
                  const name = state.players.players[e.playerId!]?.name ?? 'Unnamed';
                  return (
                    <tr key={e.playerId} className={passed.has(e.playerId!) ? 'muted' : undefined}>
                      <td>{e.position}</td>
                      <td><PlayerName id={e.playerId} name={name} /></td>
                      <td>{team ? <TeamName team={team} season={state.season} variant="abbr" size={18} /> : t}</td>
                      <td className="num">{e.rating ?? '—'}</td>
                      <td className="num">{e.age ?? '—'}</td>
                      <td>{e.contractAmount != null ? `$${e.contractAmount}` : '—'} thru S{e.contractEnd}{e.restricted ? ' (rookie)' : ''}</td>
                      <td>{passed.has(e.playerId!) ? 'Not extending' : <span className="muted">Open</span>}</td>
                      <td>
                        {passed.has(e.playerId!)
                          ? <button className="btn" disabled={busy} aria-label={`Reconsider ${name}`} onClick={() => onPass(e.playerId!, false)}>Reconsider</button>
                          : (
                            <>
                              <button className="btn" aria-label={`Extend ${name}`} onClick={() => onExtend(t, e.playerId!)}>Extend</button>
                              {' '}
                              <button className="btn" disabled={busy} aria-label={`Don't extend ${name}`} onClick={() => onPass(e.playerId!, true)}>Don't extend</button>
                            </>
                          )}
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
