import { Link } from 'react-router-dom';
import type { Team } from '../../engine/shared/types';
import { TeamMark } from './TeamMark';

/** Logo plus name. 'short' is the last word of the name ("Venom"); 'abbr' is the abbreviation. `name`/`abbr` override the team's (history pages show the name a team used that season). */
export function TeamName({ team, season, variant = 'full', to, size = 20, name = team.name, abbr = team.abbr, rank = null }: {
  team: Team; season: number; variant?: 'full' | 'short' | 'abbr'; to?: string; size?: number; name?: string; abbr?: string;
  /** A poll ranking shown as a small number before the name (null for an unranked team). */
  rank?: number | null;
}) {
  const label = variant === 'abbr' ? abbr : variant === 'short' ? name.split(' ').slice(-1)[0] : name;
  const title = variant === 'full' ? undefined : name;
  const body = <>{rank !== null && <span className="team-rank" title={`Ranked #${rank}`}>{rank}</span>}<TeamMark team={team} season={season} size={size} label={name} decorative={variant === 'full'} /><span className="team-name-text">{label}</span></>;
  return to
    ? <Link className="team-name" to={to} title={title}>{body}</Link>
    : <span className="team-name" title={title}>{body}</span>;
}
