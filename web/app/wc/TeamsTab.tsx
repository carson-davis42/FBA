import { Link } from 'react-router-dom';
import type { RostersFile, Team, WorldCupFile } from '../../engine/shared/types';
import { countryRating } from '../../engine/wc/rating';
import { TeamName } from '../components/TeamName';

export function TeamsTab({ wc, rosters, byId, season }: { wc: WorldCupFile; rosters: RostersFile; byId: Map<string, Team>; season: number }) {
  const group = (id: string) => Object.keys(wc.groups).find(g => wc.groups[g].includes(id)) ?? '';
  const rows = wc.field
    .map(id => ({ id, rating: countryRating(rosters.teams[id] ?? []) }))
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  return (
    <ul className="card-grid wc-teams">
      {rows.map(r => {
        const t = byId.get(r.id);
        return (
          <li key={r.id} className="card wc-team">
            {t ? <TeamName team={t} season={season} to={`/league/fbawc/team/${r.id}`} /> : <Link to={`/league/fbawc/team/${r.id}`}>{r.id}</Link>}
            <span className="wc-team-rating">{r.rating.toFixed(1)}</span>
            <span className="muted">Group {group(r.id)}</span>
          </li>
        );
      })}
    </ul>
  );
}
