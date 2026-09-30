import type { Team } from '../../engine/shared/types';

/** `label` overrides the name in the alt text (history pages show the name a team used that season). */
export function TeamMark({ team, season, size = 32, label }: { team: Team; season: number; size?: number; label?: string }) {
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
