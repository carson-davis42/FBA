import { Link } from 'react-router-dom';
import { teamRating } from '../../engine/jc/rankings';
import type { JcState } from '../../engine/jc/state';
import { tournamentChampion, tournamentTable } from '../../engine/jc/tournaments';
import type { Team } from '../../engine/shared/types';
import { TeamName } from '../components/TeamName';

export const TOURNAMENT_ROUND_LABELS = ['Round 1', 'Round 2', 'Placement'];

/**
 * One preseason tournament: its field before a game is played, then its rounds, games and table as they are played. `watchNo` is the
 * game to watch next in this tournament (null when it has none open).
 */
export function TournamentCard({ field, state, season, ranks, watchNo = null }: {
  field: { id: string; name: string; teams: string[] };
  state: JcState;
  season: number;
  ranks: Map<string, number>;
  watchNo?: number | null;
}) {
  const byId = new Map<string, Team>(state.teams.teams.map(t => [t.teamId, t]));
  const teamCell = (id: string) => {
    const t = byId.get(id);
    return t ? <TeamName team={t} season={season} variant="abbr" to={`/league/fbajc/team/${id}`} rank={ranks.get(id) ?? null} /> : <span>{id}</span>;
  };
  const rating = (id: string) => teamRating(state.rosters.teams[id] ?? []).toFixed(1);
  const sched = state.schedule!.days.flatMap(d => d.games);
  const results = state.results?.games ?? [];
  const done = new Map(results.map(r => [r.gameNo, r]));
  const mine = sched.filter(g => g.tournament === field.id).sort((a, b) => a.gameNo - b.gameNo);
  const champion = tournamentChampion(field, sched, results);
  const table = tournamentTable(field, sched, results);
  const played = mine.some(g => done.has(g.gameNo));
  return (
    <section className="card jc-tournament jc-field">
      <h2><Link to={`/league/fbajc/tournaments/${field.id}`}>{field.name}</Link></h2>
      {watchNo !== null && <p><Link className="btn" to={`/league/fbajc/game/${watchNo}`} aria-label={`Watch next game in ${field.name}`}>Watch next</Link></p>}
      {!played ? (
        <ol className="jc-seeds">
          {field.teams.map(id => <li key={id}>{teamCell(id)} <span className="muted">{rating(id)}</span></li>)}
        </ol>
      ) : (
        <>
          {TOURNAMENT_ROUND_LABELS.map((label, ri) => {
            const games = mine.slice(ri * 4, ri * 4 + 4);
            if (games.length === 0) return null;
            return (
              <div key={label}>
                <h3>{label}</h3>
                <ul className="jc-games">
                  {games.map(g => {
                    const r = done.get(g.gameNo);
                    return (
                      <li key={g.gameNo} className={`jc-game jc-tgame${r ? '' : ' jc-unplayed'}`}>
                        <span className={r && r.awayPts > r.homePts ? 'jc-winner' : undefined}>{teamCell(g.away)}</span>
                        <span className="jc-score">{r ? <Link to={`/league/fbajc/game/${g.gameNo}`} title="Box score">{r.awayPts}–{r.homePts}</Link> : 'vs'}</span>
                        <span className={r && r.homePts > r.awayPts ? 'jc-winner' : undefined}>{teamCell(g.home)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p><Link to={`/league/fbajc/tournaments/${field.id}`}>Open the bracket ▸</Link></p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Place</th><th>Team</th><th>W-L</th></tr></thead>
              <tbody>
                {table.map(r => (
                  <tr key={r.teamId} className={r.teamId === champion ? 'jc-champion' : undefined}>
                    <td>{r.place ?? '–'}</td>
                    <td>{teamCell(r.teamId)}</td>
                    <td>{r.w}-{r.l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
