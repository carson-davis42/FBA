import { Link, useParams, useSearchParams } from 'react-router-dom';
import { franchiseIndex } from '../../engine/history/franchiseRoster';
import { rosterFromBios } from '../../engine/history/seasonRoster';
import { resolveHistoryTeam } from '../../engine/shared/franchises';
import type { FranchisesFile, HallOfFameFile, PastBracket as PastBracketDoc, PastSeries, PastSide, PlayerBiosFile, PlayersFile, RostersFile, SummaryFile, Team, TeamsFile } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { teamTheme, teamVars } from '../components/teamColors';
import { ACCENT_SIDES, ScoreBug, type BugSide } from '../season/GameViews';
import { roundLabel } from './PastBracket';
import './history.css';

const LEAGUES = ['fba', 'fbad2', 'fbajc', 'fbawc'] as const;
type League = (typeof LEAGUES)[number];
const SCORE = /^(\d+)[–-](\d+)(?: (\d?OT))?$/;
const NOTE = 'Rosters hold the players the app has a career bio for, so they can be partial.';

interface Row { playerId: string; name: string; honours: string[]; slot: { position: string; rating: number | null; age: number | null; points: number } | null }

/** The bracket a game belongs to: the season's main one, the FBAJC NIT, or one D2 group's. */
function bracketOf(summary: SummaryFile, which: string | null): PastBracketDoc | null {
  if (which === 'nit') return summary.jc?.nitBracket ?? null;
  if (which) return summary.pastBrackets?.find(p => p.group === which)?.bracket ?? null;
  return summary.pastBracket ?? summary.pastBrackets?.[0]?.bracket ?? null;
}

function resultOf(s: PastSeries): { home: string; away: string; tag: string | null } {
  const m = s.score ? SCORE.exec(s.score) : null;
  if (m) return { home: m[s.winner === 'home' ? 1 : 2], away: m[s.winner === 'home' ? 2 : 1], tag: m[3] ?? null };
  if (s.unscored) return { home: '—', away: '—', tag: null };
  return { home: String(s.homeWins), away: String(s.awayWins), tag: null };
}

function RosterCard({ title, rows, showSlot, empty }: { title: string; rows: Row[]; showSlot: boolean; empty: string }) {
  return (
    <section className="card headed">
      <div className="card-head"><h3>{title}</h3></div>
      {rows.length === 0 ? <p className="muted">{empty}</p> : (
        <div className="table-wrap">
          <table className="stat-table">
            <thead>
              <tr><th>Player</th>{showSlot && <><th>Pos</th><th className="n">Rtg</th><th className="n">Age</th><th className="n">Pts</th></>}<th>Honours</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.playerId}>
                  <td><PlayerLinkById id={r.playerId} name={r.name} /></td>
                  {showSlot && <><td>{r.slot?.position ?? '—'}</td><td className="n">{r.slot?.rating ?? '—'}</td><td className="n">{r.slot?.age ?? '—'}</td><td className="n">{r.slot?.points ?? '—'}</td></>}
                  <td className="muted">{r.honours.join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const PlayerLinkById = ({ id, name }: { id: string; name: string }) => <Link to={`/history/fba/players/${id}`}>{name}</Link>;

/** A game or series of an old bracket as a box score: the result, and each team's players recorded for that season. */
export function BoxScorePage() {
  const { league = '', season = '', seriesId = '' } = useParams();
  const [params] = useSearchParams();
  const which = params.get('bracket');
  const n = Number(season);
  const ok = (LEAGUES as readonly string[]).includes(league) && Number.isInteger(n) && n > 0;
  const lg = league as League;
  const summary = useDoc<SummaryFile>(ok ? `leagues/${lg}/S${n}/summary.json` : null);
  const teamsDoc = useDoc<TeamsFile>(ok ? `leagues/${lg}/teams.json` : null);
  const franchises = useDoc<FranchisesFile>(ok && lg === 'fba' ? 'leagues/fba/franchises.json' : null);
  const bios = useDoc<PlayerBiosFile>(ok ? 'leagues/fba/playerBios.json' : null);
  const players = useDoc<PlayersFile>(ok ? 'players.json' : null);
  const hof = useDoc<HallOfFameFile>(ok && lg === 'fba' ? 'leagues/fba/hallOfFame.json' : null);
  const rosterDoc = useDoc<RostersFile>(ok && lg === 'fba' && n >= 78 ? `leagues/fba/S${n}/rosters.json` : null);

  if (!ok) return <p className="error">Unknown game.</p>;
  const docs = [summary, teamsDoc, bios, players];
  const failure = docs.map(docFailure).find(Boolean);
  if (failure) return <p className="error">Couldn't load the game: {failure.message}</p>;
  if (![...docs, ...(lg === 'fba' ? [franchises, hof] : [])].every(docSettled) || (n >= 78 && lg === 'fba' && !docSettled(rosterDoc))) return <p className="muted">Loading…</p>;

  const back = `/history/${lg}/season/${n}`;
  const bracket = summary.data ? bracketOf(summary.data, which) : null;
  const s = bracket?.series.find(x => x.id === seriesId);
  if (!bracket || !s || !s.home || !s.away || !players.data) {
    return <section className="stack"><p className="error">No such game.</p><p><Link to={back}>← Back to S{n}</Link></p></section>;
  }

  const teams = teamsDoc.data?.teams ?? [];
  const teamOf = (side: PastSide): Team | undefined => (lg === 'fba'
    ? resolveHistoryTeam(teams, franchises.data, side.name, n)?.team
    : teams.find(t => t.name === side.name));
  const fbaIndex = (teamId: string) => {
    const franchise = franchises.data?.franchises.find(f => f.teamId === teamId);
    return franchise ? franchiseIndex({ franchise, players: players.data!, bios: bios.data ?? null, summaries: [], hof: hof.data ?? null, rosters: rosterDoc.data ? [rosterDoc.data] : [] }) : null;
  };
  const rosterOf = (side: PastSide): { rows: Row[]; showSlot: boolean } => {
    const team = teamOf(side);
    if (lg === 'fba') {
      const rows = (team ? fbaIndex(team.teamId)?.rosterFor(n) : null) ?? [];
      return { rows, showSlot: rows.some(r => r.slot !== null) };
    }
    const kind = lg === 'fbad2' ? 'd2' : lg === 'fbawc' ? 'wc' : 'college';
    return { rows: rosterFromBios(kind, side.name, n, { players: players.data!, bios: bios.data ?? null }).map(r => ({ ...r, slot: null })), showSlot: false };
  };

  const res = resultOf(s);
  const bugSide = (side: PastSide, score: string, i: number): BugSide => {
    const team = teamOf(side);
    return { label: side.name, sub: side.record ?? undefined, score, team, season: n, style: team ? teamVars(teamTheme(team, lg)) : ACCENT_SIDES[i] };
  };
  const away = rosterOf(s.away);
  const home = rosterOf(s.home);
  const seed = (side: PastSide) => (side.seed ? `(${side.seed}) ` : '');
  return (
    <section className="stack">
      <PageHeader kicker={`S${n} · ${roundLabel(bracket.rounds, s.round)}`} title={`${seed(s.away)}${s.away.name} at ${seed(s.home)}${s.home.name}`} actions={<Link to={back}>← Back to S{n}</Link>} />
      <ScoreBug away={bugSide(s.away, res.away, 1)} home={bugSide(s.home, res.home, 0)} middle={s.score ? `Final${res.tag ? ` (${res.tag})` : ''}` : s.unscored ? 'Result' : 'Series'} />
      <div className="grid-2">
        <RosterCard title={`${s.away.name} in S${n}`} rows={away.rows} showSlot={away.showSlot} empty="No players recorded for this team and season." />
        <RosterCard title={`${s.home.name} in S${n}`} rows={home.rows} showSlot={home.showSlot} empty="No players recorded for this team and season." />
      </div>
      <p className="muted">{NOTE}</p>
    </section>
  );
}
