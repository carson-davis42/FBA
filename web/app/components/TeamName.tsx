import { Link } from 'react-router-dom';
import type { Team } from '../../engine/shared/types';
import { TeamMark } from './TeamMark';

/** Logo plus name. 'short' is the last word of the name ("Venom"); 'abbr' is the abbreviation. */
export function TeamName({ team, season, variant = 'full', to, size = 20 }: {
  team: Team; season: number; variant?: 'full' | 'short' | 'abbr'; to?: string; size?: number;
}) {
  const label = variant === 'abbr' ? team.abbr : variant === 'short' ? team.name.split(' ').slice(-1)[0] : team.name;
  const title = variant === 'full' ? undefined : team.name;
  const body = <><TeamMark team={team} season={season} size={size} /><span className="team-name-text">{label}</span></>;
  return to
    ? <Link className="team-name" to={to} title={title}>{body}</Link>
    : <span className="team-name" title={title}>{body}</span>;
}
