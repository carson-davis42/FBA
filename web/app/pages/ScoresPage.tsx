import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { closeTradeDeadline, leagueStepProblem, recordGames, simNextGames } from '../../engine/season/moves';
import { gameDays } from '../../engine/season/schedule';
import { records } from '../../engine/season/standings';
import {
  blockingPause, gamesPlayed, PAUSE_LABEL, playerName, seasonOver, type SeasonResult, type SeasonState,
} from '../../engine/season/state';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { Team } from '../../engine/shared/types';
import { useSaving, type Versions } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';
import { PlayerName } from '../components/PlayerName';

type Target = 'next' | 'day' | 'pause' | 'season' | number;

function TeamLine({ team, rec, pts, won, season }: { team: Team; rec: string; pts: number | null; won: boolean; season: number }) {
  return (
    <div className={`team-line${won ? ' won' : ''}`}>
      <TeamName team={team} season={season} variant="abbr" size={24} />
      <span className="rec">{rec}</span>
      <span className="pts">{pts ?? ''}</span>
    </div>
  );
}

export function ScoresPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, versions, error, reload } = useSeasonState(lg);
  const saving = useSaving();
  const [day, setDay] = useState<number | null>(null);
  const [simTo, setSimTo] = useState('pause');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const stop = useRef(false);

  /** Stops an in-progress "Sim to…" loop when the commissioner navigates away, since its Stop button leaves with the page. */
  useEffect(() => () => { stop.current = true; }, []);

  if (!lg) return <p className="error">Scores are only for the FBA and D2.</p>;
  if (error) {
    return (
      <p className="error">
        Couldn't load the season: {error.message} <button className="btn" onClick={reload}>Retry</button>
      </p>
    );
  }
  if (!state) return <p className="muted">Loading…</p>;
  const header = <PageHeader kicker={`${LEAGUE_LABEL[lg]} · S${state.season}`} title="Scores" />;
  if (!state.schedule || !state.results) {
    return <section className="stack">{header}<p className="muted">No schedule yet. <Link to="/schedules">Make schedules ▸</Link></p></section>;
  }
  const schedule = state.schedule;
  const days = gameDays(schedule.games);
  const played = gamesPlayed(state);
  const currentDay = days.findIndex(d => d.includes(played + 1));
  const shownDay = Math.max(0, Math.min(day ?? (currentDay >= 0 ? currentDay : days.length - 1), days.length - 1));
  const pause = blockingPause(state);
  const over = seasonOver(state);
  const byTeam = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const recs = records(state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results.games);
  const rec = (id: string) => {
    const r = recs.get(id);
    return r ? `${r.w}-${r.l}` : '';
  };
  const busy = saving || progress !== null;
  const stepProblem = leagueStepProblem(state.calendar, lg);
  const blocked = busy || !!pause || over || !!stepProblem;
  const lastOfDay = (d: number) => days[d][days[d].length - 1];
  const upcoming = schedule.pauses.find(p => !p.done && p.afterGame > played) ?? null;

  const stopFor = (t: Target): number => {
    if (t === 'next') return played + 1;
    if (t === 'day') return currentDay >= 0 ? lastOfDay(currentDay) : played;
    if (t === 'pause') return upcoming ? upcoming.afterGame : schedule.games.length;
    if (t === 'season') return schedule.games.length;
    return lastOfDay(t);
  };

  const sim = async (t: Target) => {
    const target = stopFor(t);
    let s: SeasonState = state;
    let v: Versions = versions;
    stop.current = false;
    setMessage('');
    const start = gamesPlayed(s);
    const total = Math.max(0, target - start);
    setProgress({ done: 0, total });
    try {
      while (!stop.current && gamesPlayed(s) < target) {
        const at = gamesPlayed(s);
        const d = days.findIndex(x => x.includes(at + 1));
        if (d < 0) break;
        const { games, problem } = simNextGames(s, Math.min(lastOfDay(d), target) - at, Math.random);
        if (problem) {
          setMessage(problem);
          break;
        }
        if (!games.length) break;
        const result = recordGames(s, games);
        if (!result.ok) {
          setMessage(result.problems.join('; '));
          break;
        }
        v = { ...v, ...(await commitSeason(result, v)) };
        s = result.state;
        setProgress({ done: gamesPlayed(s) - start, total });
      }
    } catch (e) {
      setMessage(`${(e as Error).message} (stopped after game ${gamesPlayed(s)})`);
    } finally {
      setProgress(null);
    }
  };

  const commit = async (r: SeasonResult) => {
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    try {
      await commitSeason(r, versions);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <section className="stack">
      {header}
      {over ? (
        <div className="card">
          <p className="muted">The regular season is complete.</p>
          <p><Link className="btn primary" to={`/league/${lg}/playoffs`}>Playoffs ▸</Link></p>
        </div>
      ) : stepProblem && <p className="muted">{stepProblem}</p>}
      {pause && (
        <div className="card headed pause-card">
          <h3>Pause after game {pause.afterGame}: {PAUSE_LABEL[pause.kind]}</h3>
          {pause.kind === 'ratings' && <Link className="btn primary" to="/league/fba/ratings-pause">Adjust ratings ▸</Link>}
          {pause.kind === 'deadline' && (
            <>
              <p className="muted">Make any last trades, then close trading for the season.</p>
              <Link className="btn" to="/trade/fba">Trade page</Link>{' '}
              <button className="btn primary" disabled={busy} onClick={() => commit(closeTradeDeadline(state))}>Close trading</button>
            </>
          )}
          {pause.kind === 'allstar' && <Link className="btn primary" to="/league/fba/all-star">All-Star weekend ▸</Link>}
        </div>
      )}
      {!over && (
        <div className="card sim-controls">
          <button className="btn" disabled={blocked} onClick={() => sim('next')}>Quick-sim next game</button>
          <button className="btn" disabled={blocked} onClick={() => sim('day')}>Sim rest of day</button>
          <label>Sim to
            <select aria-label="Sim to" value={simTo} onChange={e => setSimTo(e.target.value)}>
              <option value="pause">{upcoming ? `the next pause (after game ${upcoming.afterGame})` : 'the end of the regular season'}</option>
              <option value="season">the end of the regular season</option>
              {days.map((_, d) => (d >= Math.max(currentDay, 0) ? <option key={d} value={String(d)}>the end of day {d + 1}</option> : null))}
            </select>
          </label>
          <button className="btn primary" disabled={blocked} onClick={() => sim(simTo === 'pause' || simTo === 'season' ? simTo : Number(simTo))}>Sim</button>
          {progress && (
            <span className="sim-progress">
              <progress max={progress.total || 1} value={progress.done} /> {progress.done}/{progress.total}
              <button className="btn" onClick={() => { stop.current = true; }}>Stop</button>
            </span>
          )}
        </div>
      )}
      {message && <p className="error">{message}</p>}
      <div className="day-strip">
        <button className="btn" aria-label="Previous day" disabled={shownDay === 0} onClick={() => setDay(shownDay - 1)}>‹</button>
        <strong>Day {shownDay + 1} of {days.length}</strong>
        <button className="btn" aria-label="Next day" disabled={shownDay >= days.length - 1} onClick={() => setDay(shownDay + 1)}>›</button>
        {currentDay >= 0 && shownDay !== currentDay && <button className="btn" onClick={() => setDay(null)}>Today</button>}
        <div className="chips day-chips" role="group" aria-label="Game days">
          {days.map((_, d) => (
            <button key={d} type="button" className={`chip${d === shownDay ? ' active' : ''}${d === currentDay ? ' today' : ''}`} aria-pressed={d === shownDay} aria-label={`Go to day ${d + 1}`} onClick={() => setDay(d)}>{d + 1}</button>
          ))}
        </div>
      </div>
      <div className="card-grid game-cards">
        {(days[shownDay] ?? []).map(n => {
          const g = schedule.games[n - 1];
          const r = state.results!.games[n - 1];
          const home = byTeam.get(g.home);
          const away = byTeam.get(g.away);
          if (!home || !away) return null;
          const isNext = !r && n === played + 1 && !pause && !stepProblem;
          const status = r ? `Final${r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}` : isNext ? 'Next' : 'Upcoming';
          const lines = r?.box ? [...r.box.home, ...r.box.away] : [];
          const top = lines.length ? lines.reduce((a, b) => (b.pts > a.pts ? b : a)) : null;
          return (
            <div key={n} className={`card game-card${isNext ? ' next' : ''}`}>
              <div className="game-head">
                <div className="game-status">Game {n} · {status}</div>
                {r ? <Badge kind="final">final</Badge> : isNext ? <Badge kind="current">next</Badge> : null}
              </div>
              <TeamLine team={away} rec={rec(away.teamId)} pts={r ? r.awayPts : null} won={!!r && r.awayPts > r.homePts} season={state.season} />
              <TeamLine team={home} rec={rec(home.teamId)} pts={r ? r.homePts : null} won={!!r && r.homePts > r.awayPts} season={state.season} />
              {top && <div className="muted">Top: <PlayerName id={top.playerId} name={playerName(state, top.playerId)} /> {top.pts}</div>}
              <div className="game-links">
                {r && <Link to={`/league/${lg}/game/${n}`}>Box score</Link>}
                {isNext && <Link to={`/league/${lg}/game/${n}`}>Watch</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
