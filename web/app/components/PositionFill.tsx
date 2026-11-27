import { positionFill } from '../../engine/roster/rules';
import type { RosterEntry } from '../../engine/shared/types';

/** At each position, how many FBA teams have a player signed and how many spots are left. */
export function PositionFill({ teams, season }: { teams: Record<string, RosterEntry[]>; season: number }) {
  const total = Object.keys(teams).length;
  return (
    <section className="card" aria-label="Spots left by position">
      <h3>Spots left by position</h3>
      <ul className="position-fill">
        {positionFill(teams, season).map(r => (
          <li key={r.position} className="stat-tile">
            <div className="l">{r.position}</div>
            <div className="v">{r.open}</div>
            <div className="l">left · {r.filled} of {total} signed</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
