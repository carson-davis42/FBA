import { teamRating } from '../../engine/jc/rankings';
import { tournamentChampion, tournamentTable } from '../../engine/jc/tournaments';
import type { CalendarFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { jcGate } from './JcGate';
import { useJcDocs } from './useJcDocs';
import './jc.css';

const ROUNDS = ['Round 1', 'Round 2', 'Placement'];

export function TournamentsPage() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Tournaments" /></section>;
  const gate = jcGate(docs, kicker, 'Tournaments');
  if (gate) return <>{gate}</>;
  const state = docs.state!;
  const title = state.schedule ? `S${season} FBAJC Tournaments` : 'Tournaments';
  if (!state.schedule) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="muted">The season has not started.</p></section>;

  const byId = new Map<string, Team>(state.teams.teams.map(t => [t.teamId, t]));
  const teamCell = (id: string) => {
    const t = byId.get(id);
    return t ? <TeamName team={t} season={season} variant="abbr" to={`/league/fbajc/team/${id}`} /> : <span>{id}</span>;
  };
  const rating = (id: string) => teamRating(state.rosters.teams[id] ?? []).toFixed(1);
  const sched = state.schedule.days.flatMap(d => d.games);
  const results = state.results?.games ?? [];
  const done = new Map(results.map(r => [r.gameNo, r]));

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={title} />
      <div className="jc-tournaments">
        {state.schedule.tournaments.map(f => {
          const mine = sched.filter(g => g.tournament === f.id).sort((a, b) => a.gameNo - b.gameNo);
          const champion = tournamentChampion(f, sched, results);
          const table = tournamentTable(f, sched, results);
          const played = mine.some(g => done.has(g.gameNo));
          return (
            <section key={f.id} className="card jc-tournament">
              <h2>{f.name}</h2>
              {!played ? (
                <ol className="jc-seeds">
                  {f.teams.map(id => <li key={id}>{teamCell(id)} <span className="muted">{rating(id)}</span></li>)}
                </ol>
              ) : (
                <>
                  {ROUNDS.map((label, ri) => {
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
                                <span className="jc-score">{r ? `${r.awayPts}–${r.homePts}` : 'vs'}</span>
                                <span className={r && r.homePts > r.awayPts ? 'jc-winner' : undefined}>{teamCell(g.home)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
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
        })}
      </div>
    </section>
  );
}
