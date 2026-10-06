import { Link, useParams } from 'react-router-dom';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, RostersFile, Team, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { useWcRosters } from '../wc/useWcRosters';
import { PageHeader } from '../components/PageHeader';
import { teamRating } from '../components/rosterColumns';
import { teamTheme, teamVars } from '../components/teamColors';
import { TeamMark } from '../components/TeamMark';
import './league.css';
import './roster.css';

export function LeaguePage() {
  const { league = '' } = useParams();
  const valid = isLeagueId(league);
  const isWc = league === 'fbawc';
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams, error } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const wc = useWcRosters(isWc);
  const season = valid && meta ? (isWc ? wc.season : meta.rosterSeason[league]) : undefined;
  const { data: plainRosters } = useDoc<RostersFile>(season === undefined || isWc ? null : `leagues/${league}/S${season}/rosters.json`);
  const rosters = isWc ? wc.rosters ?? undefined : plainRosters;

  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (error) return <p className="error">Couldn't load teams: {error.message}</p>;
  if (isWc && wc.settled && wc.rosters === null) return <p className="muted">No World Cup rosters yet. Start qualifying to generate them.</p>;
  if (!teams || !rosters || season === undefined) return <p className="muted">Loading…</p>;

  const groups = new Map<string | null, Team[]>();
  for (const t of teams.teams) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);

  const actions = (league === 'fba' || league === 'fbad2') ? (
    <>
      {!rosters.locked && league === 'fba' && <Link className="btn" to="/league/fba/free-agency">Free agency</Link>}
      {!rosters.locked && league === 'fbad2' && <Link className="btn" to="/league/fbad2/ratings">D2 ratings reset</Link>}
      {!rosters.locked && league === 'fbad2' && <Link className="btn" to="/league/fbad2/draft">D2 draft</Link>}
      {!rosters.locked && league === 'fba' && <Link className="btn" to="/trade/fba">Trade</Link>}
    </>
  ) : undefined;

  return (
    <section>
      <PageHeader kicker={LEAGUE_LABEL[league]} title="Teams" actions={actions} />
      <p className="muted league-sub">S{season} rosters · {teams.teams.length} teams{rosters.locked ? ' · final (locked)' : ''}</p>
      {[...groups.entries()].map(([code, list]) => (
        <div className="group" key={code ?? 'all'}>
          <h2 className="group-title">{groupLabel(league, code)}</h2>
          <div className="card-grid">
            {[...list].sort((a, b) => a.name.localeCompare(b.name)).map(t => {
              const rating = teamRating(rosters.teams[t.teamId] ?? []);
              return (
                <Link key={t.teamId} className="card link headed team-tile" style={teamVars(teamTheme(t, league))} to={`/league/${league}/team/${t.teamId}`}>
                  <TeamMark team={t} season={season} size={48} />
                  <span className="team-tile-body">
                    <span className="name">{t.name}</span>
                    <span className="rtg muted">Rating <b>{rating ?? "—"}</b></span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
