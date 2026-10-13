import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import { playerRows, type PlayerRow } from '../../engine/shared/playerRows';
import { teamsInSeason } from '../../engine/shared/teams';
import type { MetaFile, PlayersFile, Position, ResultsFile, RostersFile, TeamsFile } from '../../engine/shared/types';
import { docFailure, useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlayerName } from '../components/PlayerName';
import { SortTh } from '../components/SortTh';
import { TeamName } from '../components/TeamName';
import { useSort, type SortValue } from '../components/useSort';
import './roster.css';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** Default order: rating high to low, then PPG high to low, then name; players without a rating or PPG last. */
const byDefault = (a: PlayerRow, b: PlayerRow): number =>
  (a.rating === null ? 1 : 0) - (b.rating === null ? 1 : 0)
  || (b.rating ?? 0) - (a.rating ?? 0)
  || (a.ppg === null ? 1 : 0) - (b.ppg === null ? 1 : 0)
  || (b.ppg ?? 0) - (a.ppg ?? 0)
  || a.name.localeCompare(b.name);

const value = (r: PlayerRow, key: string, teamName: (id: string) => string): SortValue => {
  switch (key) {
    case 'name': return r.name;
    case 'team': return teamName(r.teamId);
    case 'position': return r.position;
    case 'rating': return r.rating;
    case 'age': return r.age;
    case 'gp': return r.gp;
    case 'ppg': return r.ppg;
    case 'pts': return r.pts;
    case 'contract': return r.contractAmount;
    default: return null;
  }
};

export function PlayersPage() {
  const { league = '' } = useParams();
  const valid = isLeagueId(league);
  const [teamId, setTeamId] = useState('');
  const [pos, setPos] = useState<Position | ''>('');
  const [q, setQ] = useState('');
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: rawTeams, error: teamsError } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const season = valid && meta ? meta.rosterSeason[league] : undefined;
  const rosterDoc = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);
  const resultsDoc = useDoc<ResultsFile>(season === undefined ? null : `leagues/${league}/S${season}/results.json`);
  const playersDoc = useDoc<PlayersFile>(valid ? 'players.json' : null);
  const teams = useMemo(() => (rawTeams && season !== undefined ? teamsInSeason(rawTeams, season) : undefined), [rawTeams, season]);
  const results = resultsDoc.missing ? null : resultsDoc.data;
  const ready = Boolean(rosterDoc.data && playersDoc.data && (resultsDoc.missing || resultsDoc.data));

  const all = useMemo(
    () => (valid && rosterDoc.data && playersDoc.data && ready
      ? playerRows({ league, rosters: rosterDoc.data, results: results ?? null, players: playersDoc.data }).sort(byDefault)
      : []),
    [valid, league, rosterDoc.data, playersDoc.data, results, ready],
  );
  const teamName = useMemo(() => {
    const m = new Map((teams?.teams ?? []).map(t => [t.teamId, t.name]));
    return (id: string) => m.get(id) ?? id;
  }, [teams]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(r => (teamId === '' || r.teamId === teamId) && (pos === '' || r.position === pos) && (needle === '' || r.name.toLowerCase().includes(needle)));
  }, [all, teamId, pos, q]);
  const get = useMemo(() => (r: PlayerRow, key: string) => value(r, key, teamName), [teamName]);
  const { rows, sortProps } = useSort(filtered, get);

  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (league !== 'fba' && league !== 'fbad2') return <p className="muted">The players list for this league is not available yet.</p>;
  const failure = teamsError ?? docFailure(rosterDoc) ?? docFailure(playersDoc) ?? docFailure(resultsDoc);
  if (failure) return <p className="error">Couldn't load players: {failure.message}</p>;
  if (!teams || season === undefined || !ready) return <p className="muted">Loading…</p>;

  const fba = league === 'fba';
  return (
    <section>
      <PageHeader kicker={LEAGUE_LABEL[league]} title="Players" />
      <p className="muted league-sub">S{season} rosters · {rows.length} {rows.length === 1 ? 'player' : 'players'}</p>
      <div className="form-row filters card">
        <label>Team
          <select value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">All teams</option>
            {[...teams.teams].sort((a, b) => a.name.localeCompare(b.name)).map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        </label>
        <label>Position
          <select value={pos} onChange={e => setPos(e.target.value as Position | '')}>
            <option value="">All positions</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Search
          <input type="search" placeholder="Player name" value={q} onChange={e => setQ(e.target.value)} />
        </label>
      </div>
      <div className="table-wrap tall">
        <table className="stat-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <SortTh label="Player" {...sortProps('name', 'asc')} />
              <SortTh label="Team" {...sortProps('team', 'asc')} />
              <SortTh label="Pos" {...sortProps('position', 'asc')} />
              <SortTh label="Rating" className="num" {...sortProps('rating')} />
              <SortTh label="Age" className="num" {...sortProps('age', 'asc')} />
              <SortTh label="GP" className="num" {...sortProps('gp')} />
              <SortTh label="PPG" className="num" {...sortProps('ppg')} />
              <SortTh label="Pts" className="num" {...sortProps('pts')} />
              {fba && <SortTh label="Contract" className="num" {...sortProps('contract')} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const team = teams.teams.find(t => t.teamId === r.teamId);
              return (
                <tr key={r.playerId}>
                  <td className="num">{i + 1}</td>
                  <td><PlayerName id={r.playerId} name={r.name} /></td>
                  <td>{team ? <TeamName team={team} season={season} variant="abbr" size={18} to={`/league/${league}/team/${team.teamId}`} /> : <Link to={`/league/${league}/team/${r.teamId}`}>{r.teamId}</Link>}</td>
                  <td>{r.position}</td>
                  <td className="num">{r.rating ?? '—'}</td>
                  <td className="num">{r.age ?? '—'}</td>
                  <td className="num">{r.gp > 0 ? r.gp : '—'}</td>
                  <td className="num">{r.ppg === null ? '—' : r.ppg.toFixed(1)}</td>
                  <td className="num">{r.gp > 0 ? r.pts : '—'}</td>
                  {fba && <td className="num">{r.contractAmount === null ? '—' : `$${r.contractAmount}`}{r.contractEnd === null ? '' : ` · S${r.contractEnd}`}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
