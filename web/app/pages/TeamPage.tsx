import { Link, useParams } from 'react-router-dom';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, PlayersFile, RostersFile, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { RosterTable } from '../components/RosterTable';
import { teamRating } from '../components/rosterColumns';
import { TeamMark } from '../components/TeamMark';
import './league.css';

export function TeamPage() {
  const { league = '', teamId = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const { data: players } = useDoc<PlayersFile>(valid ? 'players.json' : null);
  const season = valid && meta ? meta.rosterSeason[league] : undefined;
  const { data: rosters } = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);

  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (!teams || !players || !rosters || season === undefined) return <p className="muted">Loading…</p>;
  const team = teams.teams.find(t => t.teamId === teamId);
  if (!team) return <p className="error">No team "{teamId}" in {LEAGUE_LABEL[league]}.</p>;
  const entries = rosters.teams[team.teamId] ?? [];

  return (
    <section>
      <p><Link to={`/league/${league}`} className="muted">← {LEAGUE_LABEL[league]}</Link></p>
      <div className="team-hero">
        <TeamMark team={team} season={season} size={72} />
        <div>
          <h1>{team.name}</h1>
          <div className="muted">{groupLabel(league, team.group)} · S{season} · Team rating {teamRating(entries) ?? '—'}</div>
        </div>
      </div>
      <div className="table-wrap">
        <RosterTable league={league} entries={entries} players={players.players} />
      </div>
    </section>
  );
}
