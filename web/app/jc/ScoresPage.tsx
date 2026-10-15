import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mulberry32 } from '../../engine/d2/random';
import { fbajcGateProblem } from '../../engine/college/recruiting';
import { openSpots } from '../../engine/college/walkOns';
import { playDay, playToEnd, regularSeasonOver } from '../../engine/jc/play';
import { nextJcGame } from '../../engine/jc/watch';
import { namesNeeded, redrawFields, startSeason } from '../../engine/jc/start';
import { DAYS, dayPlayed, type JcState } from '../../engine/jc/state';
import { calendarProblem } from '../../engine/season/moves';
import { records } from '../../engine/season/standings';
import { collegeName } from '../../engine/college/state';
import { pollRanks } from '../../engine/jc/rankings';
import { groupLabel } from '../../engine/shared/leagues';
import type { CalendarFile, SummaryFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { PlayerName } from '../components/PlayerName';
import { TeamName } from '../components/TeamName';
import { jcGate } from './JcGate';
import { useJcDocs } from './useJcDocs';
import { useJcRun } from './useJcRun';
import '../pages/season.css';
import './jc.css';

const KIND = { tournament: 'Preseason tournament', challenge: 'Conference challenge', conference: 'Conference play' } as const;
const newRng = () => mulberry32(Math.floor(Math.random() * 2 ** 32));

/** The last champion and runner-up team ids, resolved by name from last season's summary. */
function lastFinalists(state: JcState, last: SummaryFile | null): { champion: string | null; runnerUp: string | null } {
  const c = last?.champions[0];
  const find = (name: string | null | undefined): string | null =>
    name ? state.teams.teams.find(t => t.name === name)?.teamId ?? null : null;
  return { champion: c?.teamId ?? find(c?.champion), runnerUp: c?.runnerUpId ?? find(c?.runnerUp) };
}

export function ScoresPage() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const { saving, error, run } = useJcRun(docs.versions, docs.reload);
  const [picked, setPicked] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Scores" /></section>;
  const title = `S${season} FBAJC`;
  const gate = jcGate(docs, kicker, 'Scores');
  if (gate) return <>{gate}</>;
  const state = docs.state!;

  const byId = new Map<string, Team>(state.teams.teams.map(t => [t.teamId, t]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const link = (id: string) => `/league/fbajc/team/${id}`;
  const ranks = pollRanks(state.rankings?.snapshots);
  const teamCell = (id: string) => {
    const t = byId.get(id);
    return t ? <TeamName team={t} season={season} variant="abbr" to={link(id)} rank={ranks.get(id) ?? null} /> : <span>{id}</span>;
  };
  const last = lastFinalists(state, docs.lastSummary);
  const stepProblem = calendarProblem(state.calendar, 'fbajc', 'The season is played');

  if (!state.schedule) {
    const spots = openSpots(state.rosters);
    const reason = stepProblem ?? (spots > 0 ? 'Fill the open roster spots with walk-ons first' : fbajcGateProblem(state.board, state.rosters));
    return (
      <section className="jc-page">
        <PageHeader kicker={kicker} title={title} />
        <p className="muted">The season has not started. It needs every roster full, so fill any open spots with walk-ons first. Starting draws the 27 preseason tournaments and the whole 29-day schedule.</p>
        {spots > 0 && <p>{spots} roster spots are open. <Link to="/league/fbajc/recruiting">Fill them with walk-ons in Recruiting</Link>.</p>}
        <div className="jc-actions">
          <button className="btn primary" disabled={saving || !!reason} title={reason ?? undefined} onClick={() => void run(() => startSeason(state, newRng(), last))}>Start season</button>
        </div>
        {reason && <p className="muted">{reason}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const schedule = state.schedule;
  const played = dayPlayed(state);
  const day = Math.min(Math.max(picked ?? Math.min(played + 1, DAYS), 1), DAYS);
  const dayDoc = schedule.days.find(d => d.day === day);
  const results = new Map((state.results?.games ?? []).map(g => [g.gameNo, g]));
  const recs = records(state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? []);
  const over = regularSeasonOver(state);
  const playReason = stepProblem ?? (over ? 'The regular season is over' : null);
  const blocked = saving || playing || !!playReason;
  const needed = namesNeeded(state);
  const nextGame = nextJcGame(state);
  const nextNo = typeof nextGame === 'string' || stepProblem ? null : nextGame.gameNo;
  const notStarted = (state.results?.games.length ?? 0) === 0;

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={title} />
      <p className="muted">Day {played} of {DAYS} played</p>
      {notStarted && (
        <section>
          <h2>Tournament fields</h2>
          <div className="jc-fields">
            {schedule.tournaments.map(f => (
              <div key={f.id} className="card jc-field">
                <h3>{f.name}</h3>
                <ol>{f.teams.map(id => <li key={id}>{name(id)}</li>)}</ol>
              </div>
            ))}
          </div>
          <div className="jc-actions">
            <button className="btn" disabled={saving} onClick={() => void run(() => redrawFields(state, newRng(), last))}>Re-draw tournament fields</button>
          </div>
        </section>
      )}
      <div className="day-strip">
        <button className="btn" aria-label="Previous day" disabled={day <= 1} onClick={() => setPicked(day - 1)}>‹</button>
        <strong>Day {day} of {DAYS}</strong>
        <button className="btn" aria-label="Next day" disabled={day >= DAYS} onClick={() => setPicked(day + 1)}>›</button>
        <span className="muted">{dayDoc ? KIND[dayDoc.kind] : ''}</span>
        {picked !== null && picked !== Math.min(played + 1, DAYS) && <button className="btn" onClick={() => setPicked(null)}>Today</button>}
        <div className="chips day-chips" role="group" aria-label="Game days">
          {Array.from({ length: DAYS }, (_, i) => i + 1).map(d => (
            <button key={d} type="button" className={`chip${d === day ? ' active' : ''}${d === Math.min(played + 1, DAYS) ? ' today' : ''}`} aria-pressed={d === day} aria-label={`Go to day ${d}`} onClick={() => setPicked(d)}>{d}</button>
          ))}
        </div>
      </div>
      <div className="jc-actions">
        {nextNo !== null && !saving && !playing
          ? <Link className="btn primary" to={`/league/fbajc/game/${nextNo}`}>Watch next game</Link>
          : <button className="btn primary" disabled title={playReason ?? undefined}>Watch next game</button>}
        <button className="btn" disabled={blocked} title={playReason ?? undefined} onClick={() => void run(() => playDay(state, newRng()))}>Play day</button>
        <button className="btn" disabled={blocked} title={playReason ?? undefined} onClick={() => { setPlaying(true); setTimeout(() => { void run(() => playToEnd(state, newRng())).finally(() => setPlaying(false)); }, 0); }}>{playing ? 'Playing...' : 'Play to end of regular season'}</button>
      </div>
      {playReason && <p className="muted">{playReason}</p>}
      {over && <p><Link to="/league/fbajc/postseason">The regular season is over: on to the postseason</Link></p>}
      {error && <p className="error">{error}</p>}
      {dayDoc && dayDoc.games.length === 0 ? (
        <p className="muted">The games for this day are drawn when the day before is played.</p>
      ) : (
        <div className="card-grid game-cards">
          {(dayDoc?.games ?? []).map(g => {
            const r = results.get(g.gameNo);
            const away = byId.get(g.away);
            const home = byId.get(g.home);
            if (!away || !home) return null;
            const isNext = !r && g.gameNo === nextNo;
            const lines = r?.box ? [...r.box.home, ...r.box.away] : [];
            const top = lines.length ? lines.reduce((a, b) => (b.pts > a.pts ? b : a)) : null;
            const codes = [...new Set([away.group, home.group].filter((c): c is string => !!c))];
            const status = r ? `Final${r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}` : isNext ? 'Next' : 'Upcoming';
            const line = (t: Team, pts: number | null, won: boolean) => {
              const rec = recs.get(t.teamId);
              return (
                <div className={`team-line${won ? ' won' : ''}`}>
                  {teamCell(t.teamId)}
                  <span className="rec">{rec ? `${rec.w}-${rec.l}` : ''}</span>
                  <span className="pts">{pts ?? ''}</span>
                </div>
              );
            };
            return (
              <div key={g.gameNo} className={`card game-card${isNext ? ' next' : ''}`}>
                <div className="game-head">
                  <div className="game-status">
                    Game {g.gameNo} · {status}
                    {codes.length > 0 && <span className="game-conf" title={codes.map(c => groupLabel('fbajc', c)).join(' / ')}>{codes.join('/')}</span>}
                  </div>
                  {r ? <Badge kind="final">final</Badge> : isNext ? <Badge kind="current">next</Badge> : null}
                </div>
                {line(away, r ? r.awayPts : null, !!r && r.awayPts > r.homePts)}
                {line(home, r ? r.homePts : null, !!r && r.homePts > r.awayPts)}
                {top && <div className="muted">Top: <PlayerName id={top.playerId} name={collegeName(state.players, top.playerId)} /> {top.pts}</div>}
                <div className="game-links">
                  {r && <Link to={`/league/fbajc/game/${g.gameNo}`}>Box score</Link>}
                  {isNext && <Link to={`/league/fbajc/game/${g.gameNo}`}>Watch</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {needed.length > 0 && (
        <section className="card">
          <h2>Names needed</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Team</th><th>Pos</th><th>Class</th><th>Rating</th></tr></thead>
              <tbody>
                {needed.map(n => (
                  <tr key={n.playerId}>
                    <td><Link to={link(n.teamId)}>{name(n.teamId)}</Link></td>
                    <td>{n.position}</td>
                    <td>{n.classYear}</td>
                    <td>{n.rating}</td>
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
