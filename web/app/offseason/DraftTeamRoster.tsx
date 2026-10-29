import { draftRoster } from '../../engine/offseason/fbaDraft';
import type { RosterEntry, Team } from '../../engine/shared/types';
import { Hero } from '../components/Hero';
import { PlayerName } from '../components/PlayerName';
import { teamTheme, teamVars } from '../components/teamColors';
import { TeamMark } from '../components/TeamMark';
import './offseason.css';

/** The team on the clock in a draft: a banner in its colours and logo, its roster by position and the positions it still needs. */
export function DraftTeamRoster({ team, entries, season, kicker, nameOf }: {
  team: Team | undefined; entries: RosterEntry[]; season: number; kicker: string; nameOf: (id: string) => string;
}) {
  const rows = draftRoster(entries, season);
  return (
    <>
      {team && (
        <Hero
          level="h2"
          theme={teamTheme(team, 'fba', season)}
          logo={<TeamMark team={team} season={season} size={72} />}
          kicker={kicker}
          title={team.name}
          stats={[
            { label: 'Needs', value: rows.filter(r => r.need).length },
            { label: 'Players', value: rows.reduce((sum, r) => sum + r.players.length, 0) },
          ]}
        />
      )}
      <div className="card headed" style={team ? teamVars(teamTheme(team, 'fba', season)) : undefined}>
        <table className="stat-table" aria-label="Roster of the team on the clock">
          <thead><tr><th>Pos</th><th>Player</th><th className="num">Rating</th><th className="num">Age</th><th>Contract</th><th>Need</th></tr></thead>
          <tbody>
            {rows.flatMap(({ position, players: held, need }) => (held.length === 0
              ? [<tr key={position} className="need-row"><td>{position}</td><td className="muted">Open</td><td /><td /><td /><td><strong>Need</strong></td></tr>]
              : held.map(e => (
                <tr key={e.playerId} className={need ? 'need-row' : undefined}>
                  <td>{position}</td>
                  <td><PlayerName id={e.playerId!} name={nameOf(e.playerId!)} /></td>
                  <td className="num">{e.rating ?? '—'}</td>
                  <td className="num">{e.age ?? '—'}</td>
                  <td>{e.contractAmount != null && e.contractEnd != null ? `$${e.contractAmount} thru S${e.contractEnd}${e.restricted ? (e.contractEnd < season ? ' (rookie, team option)' : ' (rookie)') : ''}` : '—'}</td>
                  <td>{need ? <strong>Need (expired)</strong> : ''}</td>
                </tr>
              ))))}
          </tbody>
        </table>
        <p className="muted">Needs: {rows.filter(r => r.need).map(r => r.position).join(', ') || 'none'}</p>
      </div>
    </>
  );
}
