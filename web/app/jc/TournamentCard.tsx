import { Link } from 'react-router-dom';
import { teamRating } from '../../engine/jc/rankings';
import type { JcState } from '../../engine/jc/state';
import { projectedBracket, tournamentChampion, tournamentTable } from '../../engine/jc/tournaments';
import type { Team } from '../../engine/shared/types';
import { TeamName } from '../components/TeamName';

export const TOURNAMENT_ROUND_LABELS = ['Round 1', 'Round 2', 'Placement'];

/** One matchup of a round: `gameNo` is null for a matchup that is not drawn into the schedule yet, whose sides are null until the game feeding them is played. */
export interface RoundGame { gameNo: number | null; home: string | null; away: string | null }

/**
 * A tournament's three rounds of four games. A round the schedule has drawn shows its games; a later round whose feeder games are all
 * played shows who advanced right away, as undrawn matchups (they can't be played until their day).
 */
export function tournamentRounds(field: { id: string; name: string; teams: string[] }, state: JcState): RoundGame[][] {
  const sched = state.schedule!.days.flatMap(d => d.games).filter(g => g.tournament === field.id).sort((a, b) => a.gameNo - b.gameNo);
  const results = state.results?.games ?? [];
  return [0, 1, 2].map(ri => {
    const drawn = sched.slice(ri * 4, ri * 4 + 4);
    if (drawn.length === 4 || ri === 0) return drawn.map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away }));
    const { round2, round3 } = projectedBracket(field, results);
    return (ri === 1 ? round2 : round3).map(g => ({ gameNo: null, home: g.home, away: g.away }));
  });
}

/**
 * One preseason tournament: its field before a game is played, then its rounds, games and table as they are played. `watchNo` is the
 * game to watch next in this tournament (null when it has none open).
 */
export function TournamentCard({ field, state, season, ranks, watchNo = null, mini = false }: {
  field: { id: string; name: string; teams: string[] };
  state: JcState;
  season: number;
  ranks: Map<string, number>;
  watchNo?: number | null;
  /** A compact bracket (rounds of small matchups, TBD where a round isn't drawn yet) instead of the field list and detailed rounds. */
  mini?: boolean;
}) {
  const byId = new Map<string, Team>(state.teams.teams.map(t => [t.teamId, t]));
  const teamCell = (id: string | null, size = 20) => {
    if (id === null) return <span className="muted">TBD</span>;
    const t = byId.get(id);
    return t ? <TeamName team={t} season={season} variant="abbr" size={size} to={`/league/fbajc/team/${id}`} rank={ranks.get(id) ?? null} /> : <span>{id}</span>;
  };
  const rating = (id: string) => teamRating(state.rosters.teams[id] ?? []).toFixed(1);
  const sched = state.schedule!.days.flatMap(d => d.games);
  const results = state.results?.games ?? [];
  const done = new Map(results.map(r => [r.gameNo, r]));
  const mine = sched.filter(g => g.tournament === field.id).sort((a, b) => a.gameNo - b.gameNo);
  const champion = tournamentChampion(field, sched, results);
  const table = tournamentTable(field, sched, results);
  const played = mine.some(g => done.has(g.gameNo));
  const rounds = tournamentRounds(field, state);

  if (mini) {
    const side = (id: string | null, pts: number | null, won: boolean) => (
      <div className={`jc-mini-side${won ? ' jc-winner' : ''}`}>
        {id === null ? <span className="muted">TBD</span> : <span className="jc-mini-team">{teamCell(id, 16)}</span>}
        <span className="jc-mini-pts">{pts ?? ''}</span>
      </div>
    );
    return (
      <section className="card jc-tournament jc-field jc-mini">
        <h2><Link to={`/league/fbajc/tournaments/${field.id}`}>{field.name}</Link></h2>
        {watchNo !== null && <p><Link className="btn" to={`/league/fbajc/game/${watchNo}`} aria-label={`Watch next game in ${field.name}`}>Watch next</Link></p>}
        <div className="jc-mini-bracket" aria-label={`${field.name} bracket`}>
          {TOURNAMENT_ROUND_LABELS.map((label, ri) => (
            <div key={label} className="jc-mini-round">
              <h3>{label}</h3>
              {Array.from({ length: 4 }, (_, gi) => {
                const g = rounds[ri][gi];
                const r = g && g.gameNo !== null ? done.get(g.gameNo) : undefined;
                return (
                  <div key={gi} className={`jc-mini-game jc-tgame${r ? '' : ' jc-unplayed'}`}>
                    {side(g?.away ?? null, r ? r.awayPts : null, !!r && r.awayPts > r.homePts)}
                    {side(g?.home ?? null, r ? r.homePts : null, !!r && r.homePts > r.awayPts)}
                    {r && <Link className="jc-mini-box" to={`/league/fbajc/game/${g!.gameNo}`} title="Box score" aria-label={`Box score of game ${g!.gameNo}`}>Box</Link>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {champion && <p className="jc-champion-line"><strong>Champion:</strong> {teamCell(champion)}</p>}
      </section>
    );
  }

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
            const games = rounds[ri];
            if (games.length === 0) return null;
            return (
              <div key={label}>
                <h3>{label}</h3>
                <ul className="jc-games">
                  {games.map((g, gi) => {
                    const r = g.gameNo !== null ? done.get(g.gameNo) : undefined;
                    return (
                      <li key={gi} className={`jc-game jc-tgame${r ? '' : ' jc-unplayed'}`}>
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
