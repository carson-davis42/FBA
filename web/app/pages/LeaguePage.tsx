import { Link, useParams } from 'react-router-dom';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, RostersFile, Team, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { teamRating } from '../components/rosterColumns';
import { TeamMark } from '../components/TeamMark';
import './league.css';

export function LeaguePage() {
  const { league = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams, error } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const season = valid && meta ? meta.rosterSeason[league] : undefined;
  const { data: rosters } = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);

  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (error) return <p className="error">Couldn't load teams: {error.message}</p>;
  if (!teams || !rosters || season === undefined) return <p className="muted">Loading…</p>;

  const groups = new Map<string | null, Team[]>();
  for (const t of teams.teams) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);

  return (
    <section>
      <div className="league-head">
        <h1>{LEAGUE_LABEL[league]}</h1>
        <span className="muted">S{season} rosters · {teams.teams.length} teams{rosters.locked ? ' · final (locked)' : ''}</span>
      </div>
      {[...groups.entries()].map(([code, list]) => (
        <div className="group" key={code ?? 'all'}>
          <h2>{groupLabel(league, code)}</h2>
          <div className="team-grid">
            {[...list].sort((a, b) => a.name.localeCompare(b.name)).map(t => (
              <Link key={t.teamId} className="team-card" to={`/league/${league}/team/${t.teamId}`}>
                <TeamMark team={t} season={season} />
                <span className="name">{t.name}</span>
                <span className="rtg">{teamRating(rosters.teams[t.teamId] ?? []) ?? '—'}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
