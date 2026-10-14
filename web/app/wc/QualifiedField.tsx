import type { QualifyingFile, Team } from '../../engine/shared/types';
import { TeamName } from '../components/TeamName';

/** The 64 teams of the next World Cup, known once qualifying has finished: the 15 automatic qualifiers and the 49 who came through. */
export function QualifiedField({ q, byId, season }: { q: QualifyingFile; byId: Map<string, Team>; season: number }) {
  if (q.advanced.length === 0) return null;
  const item = (id: string) => {
    const t = byId.get(id);
    return (
      <li key={id} className={id === q.host ? 'wc-host' : undefined}>
        {t ? <TeamName team={t} season={season} to={`/league/fbawc/team/${id}`} /> : id}
        {id === q.host && <span className="wc-host-tag">Host</span>}
      </li>
    );
  };
  return (
    <section aria-label="World Cup field">
      <h2>The {q.auto.length + q.advanced.length} teams in the World Cup</h2>
      <h3>Automatic qualifiers ({q.auto.length})</h3>
      <ul className="wc-auto">{q.auto.map(item)}</ul>
      <h3>Came through qualifying ({q.advanced.length})</h3>
      <ul className="wc-auto">{q.advanced.map(item)}</ul>
    </section>
  );
}
