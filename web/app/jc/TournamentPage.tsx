import { Link, useParams } from 'react-router-dom';
import { pollRanks } from '../../engine/jc/rankings';
import { tournamentChampion, tournamentTable } from '../../engine/jc/tournaments';
import type { CalendarFile, GameResult, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { jcGate } from './JcGate';
import { tournamentRounds } from './TournamentCard';
import { useJcDocs } from './useJcDocs';
import '../pages/season.css';
import './jc.css';

export const TOURNAMENT_ROUNDS = ['Round 1', 'Round 2', 'Placement'];

/** One preseason tournament (/league/fbajc/tournaments/:id): its field of eight, each round's games with box scores, and the final table. */
export function TournamentPage() {
  const { id = '' } = useParams();
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const kicker = 'Junior College';
  const back = <p><Link to="/league/fbajc/tournaments">‹ All tournaments</Link></p>;

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Tournament" /></section>;
  const gate = jcGate(docs, kicker, 'Tournament');
  if (gate) return <>{gate}</>;
  const state = docs.state!;
  const field = state.schedule?.tournaments.find(f => f.id === id);
  if (!state.schedule || !field) {
    return <section className="jc-page"><PageHeader kicker={kicker} title="Tournament" />{back}<p className="muted">{state.schedule ? 'No such tournament.' : 'The season has not started.'}</p></section>;
  }

  const byId = new Map<string, Team>(state.teams.teams.map(t => [t.teamId, t]));
  const ranks = pollRanks(state.rankings?.snapshots);
  const team = (teamId: string | null) => {
    if (teamId === null) return <span className="muted">TBD</span>;
    const t = byId.get(teamId);
    return t ? <TeamName team={t} season={season} variant="abbr" to={`/league/fbajc/team/${teamId}`} rank={ranks.get(teamId) ?? null} /> : <span>{teamId}</span>;
  };
  const sched = state.schedule.days.flatMap(d => d.games);
  const results: GameResult[] = state.results?.games ?? [];
  const done = new Map(results.map(r => [r.gameNo, r]));
  const mine = sched.filter(g => g.tournament === field.id).sort((a, b) => a.gameNo - b.gameNo);
  const champion = tournamentChampion(field, sched, results);
  const table = tournamentTable(field, sched, results);
  const played = mine.some(g => done.has(g.gameNo));
  const rounds = tournamentRounds(field, state);
  const line = (teamId: string | null, pts: number | null, won: boolean) => (
    <div className={`team-line${won ? ' won' : ''}`}>
      {team(teamId)}
      <span className="rec" />
      <span className="pts">{pts ?? ''}</span>
    </div>
  );

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={field.name} />
      {back}
      {champion && <p><strong>Champion:</strong> {team(champion)}</p>}
      <div className="jc-bracket" aria-label={`${field.name} bracket`}>
        {TOURNAMENT_ROUNDS.map((label, ri) => {
          const games = rounds[ri];
          if (games.length === 0) return null;
          return (
            <div key={label} className="jc-bracket-round">
              <h2>{label}</h2>
              {games.map((g, gi) => {
                const r = g.gameNo !== null ? done.get(g.gameNo) : undefined;
                return (
                  <div key={gi} className="card game-card">
                    <div className="game-head">
                      <div className="game-status">{g.gameNo !== null ? `Game ${g.gameNo} · ` : ''}{r ? 'Final' : 'Upcoming'}</div>
                      {r ? <Badge kind="final">final</Badge> : null}
                    </div>
                    {line(g.away, r ? r.awayPts : null, !!r && r.awayPts > r.homePts)}
                    {line(g.home, r ? r.homePts : null, !!r && r.homePts > r.awayPts)}
                    <div className="game-links">{r && <Link to={`/league/fbajc/game/${g.gameNo}`}>Box score</Link>}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {!played ? (
        <section className="card">
          <h2>Field</h2>
          <ol className="jc-seeds">{field.teams.map(teamId => <li key={teamId}>{team(teamId)}</li>)}</ol>
        </section>
      ) : (
        <section className="card">
          <h2>Final table</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Place</th><th>Team</th><th>W-L</th></tr></thead>
              <tbody>
                {table.map(r => (
                  <tr key={r.teamId} className={r.teamId === champion ? 'jc-champion' : undefined}>
                    <td>{r.place ?? '–'}</td>
                    <td>{team(r.teamId)}</td>
                    <td>{r.w}-{r.l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
