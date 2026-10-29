import { useMemo, useState } from 'react';
import { releasePlayer } from '../../engine/roster/moves';
import { trimTeams } from '../../engine/roster/trim';
import { teamsInSeason } from '../../engine/shared/teams';
import type { TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlayerName } from '../components/PlayerName';
import { teamTheme, teamVars } from '../components/teamColors';
import { TeamName } from '../components/TeamName';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import { useSeasonPhase } from '../season/useSeasonPhase';
import './offseason.css';

/**
 * Roster trim (/league/fba/trim): every team with two players at the same position, to cut the one it does not need before free agency.
 * Never a requirement: a player whose contract has ended is left alone (he may stay or test the market), and nothing here blocks free agency.
 */
export function RosterTrimPage() {
  const { state, versions, error } = useRosterState();
  const phase = useSeasonPhase();
  const rawTeams = useDoc<TeamsFile>('leagues/fba/teams.json');
  const saving = useSaving();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const season = state?.season;
  const teams = useMemo(() => (rawTeams.data && season !== undefined ? teamsInSeason(rawTeams.data, season) : undefined), [rawTeams.data, season]);

  if (error) return <p className="error">Couldn't load rosters: {error.message}</p>;
  if (!state || !teams) return <p className="muted">Loading…</p>;

  const list = trimTeams(state);
  const cut = async (teamId: string, playerId: string) => {
    const result = releasePlayer(state, { league: 'fba', teamId, playerId, kind: 'cut' }, { batchId: newBatchId(), phase });
    if (!result.ok) { setSaveError(result.problems.join('; ')); return; }
    setBusy(true);
    setSaveError('');
    try {
      await commitMove(result, versions);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <PageHeader kicker="FBA" title="Roster trim" />
      <p className="muted">
        Teams with two players at the same position. Cut the one a team doesn't need and he goes to the free agent pool.
        Players whose contracts have ended are left alone: they may re-sign or test free agency. Nothing here is required.
      </p>
      {saveError && <p className="error">{saveError}</p>}
      {list.length === 0
        ? <div className="card"><p>No team has two players at the same position.</p></div>
        : <p>{list.length} {list.length === 1 ? 'team has' : 'teams have'} a duplicate position.</p>}
      {list.map(({ teamId, spots }) => {
        const team = teams.teams.find(t => t.teamId === teamId);
        return (
          <section key={teamId} className="card headed" style={team ? teamVars(teamTheme(team, 'fba', state.season)) : undefined} aria-label={team?.name ?? teamId}>
            <h2>{team ? <TeamName team={team} season={state.season} /> : teamId}</h2>
            <div className="table-wrap">
              <table className="stat-table" aria-label={`${team?.name ?? teamId} duplicate positions`}>
                <thead><tr><th>Pos</th><th>Player</th><th className="num">Rating</th><th className="num">Age</th><th>Contract</th><th /></tr></thead>
                <tbody>
                  {spots.flatMap(spot => [
                    ...spot.holders.map(e => {
                      const name = state.players.players[e.playerId!]?.name ?? 'Unnamed';
                      return (
                        <tr key={e.playerId}>
                          <td>{spot.position}</td>
                          <td><PlayerName id={e.playerId} name={name} /></td>
                          <td className="num">{e.rating ?? '—'}</td>
                          <td className="num">{e.age ?? '—'}</td>
                          <td>{e.contractAmount != null && e.contractEnd != null ? `$${e.contractAmount} thru S${e.contractEnd}` : '—'}{e.restricted ? ' (rookie)' : ''}</td>
                          <td><button className="btn" disabled={busy || saving} aria-label={`Cut ${name}`} onClick={() => cut(teamId, e.playerId!)}>Cut</button></td>
                        </tr>
                      );
                    }),
                    ...spot.expiring.map(e => {
                      const name = state.players.players[e.playerId!]?.name ?? 'Unnamed';
                      return (
                        <tr key={e.playerId} className="muted">
                          <td>{spot.position}</td>
                          <td><PlayerName id={e.playerId} name={name} /></td>
                          <td className="num">{e.rating ?? '—'}</td>
                          <td className="num">{e.age ?? '—'}</td>
                          <td colSpan={2}>Contract ended: may stay or test free agency</td>
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </section>
  );
}
