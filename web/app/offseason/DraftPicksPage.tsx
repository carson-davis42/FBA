import { useState } from 'react';
import type { MetaFile, PickCondition, PickObligation, PicksFile, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import './offseason.css';

export function conditionText(c: PickCondition): string {
  switch (c.kind) {
    case 'none': return 'Unprotected';
    case 'top': return `Top ${c.n} protected`;
    case 'lottery': return 'Lottery protected';
    case 'swap': return `Swap with ${c.otherTeam} (${c.betterTo} gets the better pick)`;
    case 'custom': return c.text;
  }
}

const sameCondition = (a: PickCondition, b: PickCondition) => JSON.stringify(a) === JSON.stringify(b);
const isRolled = (o: PickObligation) => o.rolls.length > 0 || o.originSeason !== o.season;
const isTraded = (o: PickObligation) => o.owner !== o.originalTeam;

type Filter = 'all' | 'traded' | 'rolled';

/** Every pick still owed in the league (/league/fba/picks): who it is from, who holds it, its protection, and where a pick has rolled to a later season. */
export function DraftPicksPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const picks = useDoc<PicksFile>('leagues/fba/picks.json');
  const teams = useDoc<TeamsFile>('leagues/fba/teams.json');
  const [filter, setFilter] = useState<Filter>('all');
  const [team, setTeam] = useState('');

  const loadError = meta.error ?? picks.error ?? teams.error;
  if (loadError) return <p className="error">Couldn't load the draft picks: {loadError.message}</p>;
  if (!meta.data || !teams.data || (!picks.data && !picks.missing)) return <p className="muted">Loading…</p>;
  const n = meta.data.currentSeason;
  const all = picks.data?.obligations ?? [];
  const shown = all
    .filter(o => (filter === 'traded' ? isTraded(o) : filter === 'rolled' ? isRolled(o) : true))
    .filter(o => !team || o.owner === team || o.originalTeam === team)
    .sort((a, b) => a.season - b.season || a.originalTeam.localeCompare(b.originalTeam) || a.priority - b.priority);
  const seasons = [...new Set(shown.map(o => o.season))];
  const teamOf = (id: string) => teams.data!.teams.find(t => t.teamId === id);
  const cell = (id: string) => { const t = teamOf(id); return t ? <TeamName team={t} season={n} variant="short" /> : id; };

  return (
    <section className="stack">
      <PageHeader kicker="FBA" title="Draft picks" />
      <p className="muted">Picks that belong to a team other than the one they are from, with their protections, and picks that rolled into a later season.</p>
      <div className="card toolbar">
        <div className="chips" role="group" aria-label="Pick filter">
          {([['all', 'All'], ['traded', 'Traded'], ['rolled', 'Rolled']] as const).map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <label>
          Team{' '}
          <select value={team} onChange={e => setTeam(e.target.value)} aria-label="Team">
            <option value="">All teams</option>
            {teams.data.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        </label>
      </div>
      {seasons.length === 0 && <p className="muted">No picks match.</p>}
      {seasons.map(season => (
        <div key={season} className="card">
          <h2>S{season}{season === n ? ' (this draft)' : ''}</h2>
          <div className="table-wrap">
            <table className="stat-table" aria-label={`S${season} picks`}>
              <thead><tr><th>From</th><th>Held by</th><th>Protection</th><th>Rolled</th><th>Note</th></tr></thead>
              <tbody>
                {shown.filter(o => o.season === season).map(o => (
                  <tr key={o.id}>
                    <td>{cell(o.originalTeam)}</td>
                    <td>{cell(o.owner)}{isTraded(o) ? '' : <span className="muted"> (own)</span>}</td>
                    <td>
                      {conditionText(o.condition)}
                      {!sameCondition(o.condition, o.originalCondition) && <span className="muted"> (was {conditionText(o.originalCondition).toLowerCase()})</span>}
                    </td>
                    <td>
                      {isRolled(o)
                        ? [...o.rolls.map(r => `S${r.fromSeason}: ${r.reason === 'protected' ? 'protection held' : 'already owed'}`), ...(o.rolls.length === 0 ? [`from S${o.originSeason}`] : [])].join('; ')
                        : <span className="muted">—</span>}
                    </td>
                    <td>{o.note || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
