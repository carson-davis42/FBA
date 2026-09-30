import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AWARD_LABEL } from '../../engine/awards/races';
import { formatScore } from '../../engine/history/format';
import type { PastAllFbaSlot, PlayersFile, SummaryFile, SummaryStanding, Team, TeamsFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { Bracket } from '../playoffs/Bracket';
import { PastBracket } from './PastBracket';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import '../pages/season.css';

type Tab = 'standings' | 'playoffs' | 'awards' | 'allstar';
const TABS: { id: Tab; label: string }[] = [
  { id: 'standings', label: 'Standings' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'awards', label: 'Awards & All-FBA' },
  { id: 'allstar', label: 'All-Star' },
];

const signed = (x: number) => (x > 0 ? `+${x}` : String(x));

interface Columns { showConf: boolean; showDiff: boolean; showMarker: boolean; showSeed: boolean }

function StandingsTable({ rows, showConf, showDiff, showMarker, showSeed }: { rows: SummaryStanding[] } & Columns) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th>Rank</th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">W%</th>
            {showConf && <th className="n">Conf</th>}
            {showDiff && <th className="n">Diff</th>}
            {showMarker && <th></th>}
            {showSeed && <th className="n">Seed</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.teamId}>
              <td>{r.rank}</td>
              <td>{r.name}</td>
              <td className="n">{r.w}</td>
              <td className="n">{r.l}</td>
              <td className="n">{r.w + r.l === 0 ? '—' : (r.w / (r.w + r.l)).toFixed(3)}</td>
              {showConf && <td className="n">{r.confW !== null && r.confL !== null ? `${r.confW}-${r.confL}` : ''}</td>}
              {showDiff && <td className="n">{r.diff === null ? '' : signed(r.diff)}</td>}
              {showMarker && <td className="marker">{r.marker ?? ''}</td>}
              {showSeed && <td className="n">{r.seed ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Standings({ season }: { season: SummaryFile }) {
  const rows = season.standings;
  if (!rows || rows.length === 0) return <p className="muted">No standings recorded</p>;
  const some = (f: (r: SummaryStanding) => boolean) => rows.some(f);
  const flags: Columns = {
    showConf: some(r => r.confW !== null && r.confL !== null),
    showDiff: some(r => r.diff !== null),
    showMarker: some(r => r.marker !== null),
    showSeed: some(r => r.seed !== null),
  };
  const byRank = (group: string) => rows.filter(r => r.group === group).sort((a, b) => a.rank - b.rank);
  return (
    <div>
      <h2>Eastern Conference</h2>
      <StandingsTable rows={byRank('E')} {...flags} />
      <h2>Western Conference</h2>
      <StandingsTable rows={byRank('W')} {...flags} />
    </div>
  );
}

function Playoffs({ season, teams, players }: { season: SummaryFile; teams: Team[]; players: PlayersFile }) {
  const champion = season.champions.find(c => c.title === 'FBA Champion');
  return (
    <div>
      {season.bracket ? (
        <Bracket league="fba" series={season.bracket.series} teams={new Map(teams.map(t => [t.teamId, t]))} season={season.season} group={null} open={null} />
      ) : season.pastBracket ? (
        <PastBracket bracket={season.pastBracket} teams={teams} season={season.season} />
      ) : champion ? (
        <p>Finals: {champion.champion} def. {champion.runnerUp ?? '—'}, {formatScore(champion.score)}</p>
      ) : (
        <p className="muted">No playoffs recorded</p>
      )}
      {champion?.finalsMvp && <p>Finals MVP: <PlayerLink id={champion.finalsMvp} players={players} /></p>}
    </div>
  );
}

function AllFbaTable({ title, slots, players }: { title: string; slots: PastAllFbaSlot[]; players: PlayersFile }) {
  return (
    <div>
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="standings">
          <tbody>
            {slots.map((s, k) => (
              <tr key={k}>
                <td>{s.slot}</td>
                <td>
                  <PlayerLink id={s.playerId} players={players} />
                  {s.playerId && s.teamId && ` (${s.teamId})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Awards({ season, players }: { season: SummaryFile; players: PlayersFile }) {
  const awards = season.awards ?? [];
  const all = season.allFba;
  const hasAllFba = !!all && (all.team1.length > 0 || all.team2.length > 0);
  if (awards.length === 0 && !hasAllFba) return <p className="muted">No awards recorded</p>;
  return (
    <div>
      {awards.length > 0 && (
        <ul className="award-winners">
          {awards.map(a => (
            <li key={a.award}>
              {AWARD_LABEL[a.award]}: <PlayerLink id={a.playerId} players={players} />
              {a.teamId !== '?' && ` (${a.teamId})`}
            </li>
          ))}
        </ul>
      )}
      {all && hasAllFba && (
        <>
          <AllFbaTable title="All-FBA Team 1" slots={all.team1} players={players} />
          <AllFbaTable title="All-FBA Team 2" slots={all.team2} players={players} />
        </>
      )}
    </div>
  );
}

function PlayerList({ ids, players }: { ids: string[]; players: PlayersFile }) {
  return (
    <>
      {ids.map((id, k) => (
        <span key={id}>{k > 0 && ', '}<PlayerLink id={id} players={players} /></span>
      ))}
    </>
  );
}

function AllStar({ season, players }: { season: SummaryFile; players: PlayersFile }) {
  const st = season.allStar;
  const rows: { key: string; node: ReactNode }[] = [];
  if (st) {
    if (st.asgWinner) rows.push({ key: 'asg', node: <>All-Star Game: {st.asgWinner}{st.asgLoser ? ` def. ${st.asgLoser}` : ''}</> });
    if (st.asgMvp) rows.push({ key: 'asgMvp', node: <>All-Star Game MVP: <PlayerLink id={st.asgMvp} players={players} /></> });
    if (st.ysgWinner) rows.push({ key: 'ysg', node: <>Young-Star champions: {st.ysgWinner}</> });
    if (st.ysgMvp) rows.push({ key: 'ysgMvp', node: <>Young-Star MVP: <PlayerLink id={st.ysgMvp} players={players} /></> });
    if (st.fivePoint) rows.push({ key: 'five', node: <>5-point contest: <PlayerLink id={st.fivePoint} players={players} /></> });
    if (st.dunk) rows.push({ key: 'dunk', node: <>Dunk contest: <PlayerLink id={st.dunk} players={players} /></> });
    if (st.allStars.length > 0) rows.push({ key: 'stars', node: <>All-Stars: <PlayerList ids={st.allStars} players={players} /></> });
    if (st.youngStars.length > 0) rows.push({ key: 'young', node: <>Young Stars: <PlayerList ids={st.youngStars} players={players} /></> });
  }
  if (rows.length === 0) return <p className="muted">No All-Star results recorded</p>;
  return <div>{rows.map(r => <p key={r.key}>{r.node}</p>)}</div>;
}

export function SeasonHistoryPage() {
  const { season: param = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('standings');
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const fbaTeams = useDoc<TeamsFile>('leagues/fba/teams.json');
  const d2Teams = useDoc<TeamsFile>('leagues/fbad2/teams.json');
  const failure = error ?? players.error ?? fbaTeams.error ?? d2Teams.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !fbaTeams.data || !d2Teams.data) return <p className="muted">Loading…</p>;
  const n = /^\d+$/.test(param) ? Number(param) : NaN;
  const season = seasons.find(s => s.season === n);
  if (!season) return <p className="muted">Not found</p>;
  const teams = [...fbaTeams.data.teams, ...d2Teams.data.teams];
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  return (
    <section>
      <h1>S{season.season} FBA season</h1>
      <SkippedWarning errors={errors} />
      <label>
        Season{' '}
        <select aria-label="Season" value={season.season} onChange={e => navigate(`/history/fba/season/${e.target.value}`)}>
          {ordered.map(s => <option key={s.season} value={s.season}>S{s.season}</option>)}
        </select>
      </label>
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'standings' && <Standings season={season} />}
      {tab === 'playoffs' && <Playoffs season={season} teams={teams} players={players.data} />}
      {tab === 'awards' && <Awards season={season} players={players.data} />}
      {tab === 'allstar' && <AllStar season={season} players={players.data} />}
    </section>
  );
}
