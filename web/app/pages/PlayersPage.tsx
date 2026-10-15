import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import { playerRows, type PlayerRow } from '../../engine/shared/playerRows';
import { teamsInSeason } from '../../engine/shared/teams';
import type { CalendarFile, LeagueId, MetaFile, PlayersFile, Position, QualifyingFile, ResultsFile, RostersFile, TeamsFile, WorldCupFile } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlayerName } from '../components/PlayerName';
import { SortTh } from '../components/SortTh';
import { TeamName } from '../components/TeamName';
import { useSort, type SortValue } from '../components/useSort';
import { jcGate } from '../jc/JcGate';
import { NamesNeeded } from '../jc/NamesNeeded';
import { useJcDocs } from '../jc/useJcDocs';
import { useWcRosters } from '../wc/useWcRosters';
import './roster.css';

const CLASS_ORDER = ['Fr', 'So', 'Jr', 'Sr'];
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
    case 'class': return r.classYear === null ? null : CLASS_ORDER.indexOf(r.classYear);
    case 'stars': return r.stars;
    default: return null;
  }
};

interface PlayersData {
  league: LeagueId;
  season: number;
  teams: TeamsFile;
  rosters: RostersFile;
  results: ResultsFile | null;
  players: PlayersFile;
}

/** Filters, sorting and the table for one league's loaded season. */
function PlayersView({ league, season, teams: teamsFile, rosters, results, players }: PlayersData) {
  const [teamId, setTeamId] = useState('');
  const [pos, setPos] = useState<Position | ''>('');
  const [q, setQ] = useState('');
  const all = useMemo(() => playerRows({ league, rosters, results, players }).sort(byDefault), [league, rosters, results, players]);
  const teamList = teamsFile.teams;
  const teamName = useMemo(() => {
    const m = new Map(teamList.map(t => [t.teamId, t.name]));
    return (id: string) => m.get(id) ?? id;
  }, [teamList]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(r => (teamId === '' || r.teamId === teamId) && (pos === '' || r.position === pos) && (needle === '' || r.name.toLowerCase().includes(needle)));
  }, [all, teamId, pos, q]);
  const get = useMemo(() => (r: PlayerRow, key: string) => value(r, key, teamName), [teamName]);
  const { rows, sortProps } = useSort(filtered, get);

  const fba = league === 'fba';
  const jc = league === 'fbajc';
  const wc = league === 'fbawc';
  const teamLabel = jc ? 'School' : wc ? 'Country' : 'Team';
  const withPlayers = new Set(all.map(r => r.teamId));
  const teamOptions = teamList.filter(t => !wc || withPlayers.has(t.teamId)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className={jc ? 'jc-page' : undefined}>
      <PageHeader kicker={LEAGUE_LABEL[league]} title="Players" />
      <p className="muted league-sub">S{season} rosters · {rows.length} {rows.length === 1 ? 'player' : 'players'}</p>
      <div className="form-row filters card">
        <label>{teamLabel}
          <select value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">{wc ? 'All countries' : jc ? 'All schools' : 'All teams'}</option>
            {teamOptions.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
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
              <SortTh label={teamLabel} {...sortProps('team', 'asc')} />
              <SortTh label="Pos" {...sortProps('position', 'asc')} />
              {jc && <SortTh label="Class" {...sortProps('class', 'asc')} />}
              {jc && <SortTh label="Stars" className="num" {...sortProps('stars')} />}
              <SortTh label="Rating" className="num" {...sortProps('rating')} />
              {!jc && <SortTh label="Age" className="num" {...sortProps('age', 'asc')} />}
              <SortTh label="GP" className="num" {...sortProps('gp')} />
              <SortTh label="PPG" className="num" {...sortProps('ppg')} />
              <SortTh label="Pts" className="num" {...sortProps('pts')} />
              {fba && <SortTh label="Contract" className="num" {...sortProps('contract')} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const team = teamList.find(t => t.teamId === r.teamId);
              const to = `/league/${league}/team/${r.teamId}`;
              return (
                <tr key={r.playerId}>
                  <td className="num">{i + 1}</td>
                  <td><PlayerName id={r.playerId} name={r.name} /></td>
                  <td>{team ? <TeamName team={team} season={season} variant={wc ? 'full' : 'abbr'} size={18} to={to} /> : <Link to={to}>{r.teamId}</Link>}</td>
                  <td>{r.position}</td>
                  {jc && <td>{r.classYear ?? '—'}</td>}
                  {jc && <td className="num">{r.stars === null ? '—' : '★'.repeat(r.stars)}</td>}
                  <td className="num">{r.rating ?? '—'}</td>
                  {!jc && <td className="num">{r.age ?? '—'}</td>}
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

function ProLoader({ league }: { league: 'fba' | 'fbad2' }) {
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const { data: rawTeams, error: teamsError } = useDoc<TeamsFile>(`leagues/${league}/teams.json`);
  const season = meta ? meta.rosterSeason[league] : undefined;
  const rosterDoc = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);
  const resultsDoc = useDoc<ResultsFile>(season === undefined ? null : `leagues/${league}/S${season}/results.json`);
  const playersDoc = useDoc<PlayersFile>('players.json');
  const teams = useMemo(() => (rawTeams && season !== undefined ? teamsInSeason(rawTeams, season) : undefined), [rawTeams, season]);
  const failure = teamsError ?? docFailure(rosterDoc) ?? docFailure(playersDoc) ?? docFailure(resultsDoc);
  if (failure) return <p className="error">Couldn't load players: {failure.message}</p>;
  if (!teams || season === undefined || !rosterDoc.data || !playersDoc.data || !(resultsDoc.missing || resultsDoc.data)) return <p className="muted">Loading…</p>;
  return <PlayersView league={league} season={season} teams={teams} rosters={rosterDoc.data} results={resultsDoc.missing ? null : resultsDoc.data ?? null} players={playersDoc.data} />;
}

function JcLoader() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const kicker = 'Junior College';
  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Players" /></section>;
  const gate = jcGate(docs, kicker, 'Players');
  if (gate) return <>{gate}</>;
  const s = docs.state!;
  return (
    <>
      <NamesNeeded state={s} onSaved={docs.reload} />
      <PlayersView league="fbajc" season={season} teams={s.teams} rosters={s.rosters} results={s.results} players={s.players} />
    </>
  );
}

function WcLoader() {
  const { season, rosters, settled } = useWcRosters();
  const teamsDoc = useDoc<TeamsFile>('leagues/fbawc/teams.json');
  const playersDoc = useDoc<PlayersFile>('players.json');
  const cupDoc = useDoc<WorldCupFile>(season === undefined ? null : `leagues/fbawc/S${season}/worldcup.json`);
  const qualDoc = useDoc<QualifyingFile>(season === undefined ? null : `leagues/fbawc/S${season}/qualifying.json`);
  const failure = docFailure(teamsDoc) ?? docFailure(playersDoc) ?? docFailure(cupDoc) ?? docFailure(qualDoc);
  const results = useMemo<ResultsFile | null>(() => {
    const games = [
      ...(qualDoc.data?.games ?? []),
      ...(cupDoc.data?.groupGames ?? []),
      ...(cupDoc.data?.knockout ?? []).flatMap(k => (k.game ? [k.game] : [])),
    ];
    return season === undefined || games.length === 0 ? null : { league: 'fbawc', season, locked: false, games };
  }, [season, cupDoc.data, qualDoc.data]);
  if (failure) return <p className="error">Couldn't load players: {failure.message}</p>;
  const ready = settled && docSettled(teamsDoc) && docSettled(playersDoc) && (season === undefined || (docSettled(cupDoc) && docSettled(qualDoc)));
  if (!ready) return <p className="muted">Loading…</p>;
  if (!rosters || season === undefined || !teamsDoc.data || !playersDoc.data) return <p className="muted">No World Cup rosters exist yet.</p>;
  return <PlayersView league="fbawc" season={season} teams={teamsDoc.data} rosters={rosters} results={results} players={playersDoc.data} />;
}

export function PlayersPage() {
  const { league = '' } = useParams();
  if (!isLeagueId(league)) return <p className="error">Unknown league "{league}".</p>;
  if (league === 'fbajc') return <JcLoader />;
  if (league === 'fbawc') return <WcLoader />;
  return <ProLoader league={league} />;
}
