import type { Team } from '../../engine/shared/types';
import { flagUrl } from './flags';

/** `label` overrides the name in the alt text (history pages show the name a team used that season). */
export function TeamMark({ team, season, size = 32, label }: { team: Team; season: number; size?: number; label?: string }) {
  const flag = team.flag ? flagUrl(team.flag) : null;
  if (flag) {
    return <img className="team-flag" src={flag} width={Math.round(size * 4 / 3)} height={size} alt={`${label ?? team.name} flag`} />;
  }
  if (team.logoFolder) {
    return (
      <img
        className="team-mark"
        src={`/logos/${encodeURIComponent(team.logoFolder)}/${season}`}
        width={size}
        height={size}
        alt={`${label ?? team.name} logo`}
      />
    );
  }
  return (
    <span
      className="team-badge"
      aria-hidden="true"
      style={{ background: team.badge.bg, color: team.badge.fg, width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
    >
      {team.abbr.slice(0, 4)}
    </span>
  );
}
