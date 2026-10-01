import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mulberry32 } from '../../engine/d2/random';
import { openSpots } from '../../engine/college/walkOns';
import { playDay, playToEnd, regularSeasonOver } from '../../engine/jc/play';
import { namesNeeded, redrawFields, startSeason } from '../../engine/jc/start';
import { DAYS, dayPlayed, type JcState } from '../../engine/jc/state';
import { calendarProblem } from '../../engine/season/moves';
import type { CalendarFile, SummaryFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useJcDocs } from './useJcDocs';
import { useJcRun } from './useJcRun';
import './jc.css';

const KIND = { tournament: 'Preseason tournament', challenge: 'Conference challenge', conference: 'Conference play' } as const;
const newRng = () => mulberry32(Math.floor(Math.random() * 2 ** 32));

/** The last champion and runner-up team ids, resolved by name from last season's summary. */
function lastFinalists(state: JcState, last: SummaryFile | null): { champion: string | null; runnerUp: string | null } {
  const c = last?.champions[0];
  const find = (name: string | null | undefined): string | null =>
    name ? state.teams.teams.find(t => t.name === name)?.teamId ?? null : null;
  return { champion: c?.teamId ?? find(c?.champion), runnerUp: find(c?.runnerUp) };
}

export function ScoresPage() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const { saving, error, run } = useJcRun(docs.versions, docs.reload);
  const [picked, setPicked] = useState<number | null>(null);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Scores" /></section>;
  const title = `S${season} FBAJC`;
  if (docs.error) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="error">{docs.error}</p></section>;
  const state = docs.state;
  if (!state) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="muted">Loading...</p></section>;

  const byId = new Map<string, Team>(state.teams.teams.map(t => [t.teamId, t]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const link = (id: string) => `/league/fbajc/team/${id}`;
  const teamCell = (id: string) => {
    const t = byId.get(id);
    return t ? <TeamName team={t} season={season} variant="abbr" to={link(id)} /> : <span>{id}</span>;
  };
  const last = lastFinalists(state, docs.lastSummary);
  const stepProblem = calendarProblem(state.calendar, 'fbajc', 'The season is played');

  if (!state.schedule) {
    const spots = openSpots(state.rosters);
    const reason = stepProblem ?? (spots > 0 ? 'Fill the open roster spots with walk-ons first' : null);
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
  const over = regularSeasonOver(state);
  const playReason = stepProblem ?? (over ? 'The regular season is over' : null);
  const blocked = saving || !!playReason;
  const needed = namesNeeded(state);
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
      <div className="jc-actions">
        <button className="btn" disabled={day <= 1} onClick={() => setPicked(day - 1)}>Prev</button>
        <strong>Day {day} of {DAYS}</strong>
        <span className="muted">{dayDoc ? KIND[dayDoc.kind] : ''}</span>
        <button className="btn" disabled={day >= DAYS} onClick={() => setPicked(day + 1)}>Next</button>
      </div>
      <div className="jc-actions">
        <button className="btn primary" disabled={blocked} title={playReason ?? undefined} onClick={() => void run(() => playDay(state, newRng()))}>Play day</button>
        <button className="btn" disabled={blocked} title={playReason ?? undefined} onClick={() => void run(() => playToEnd(state, newRng()))}>Play to end of regular season</button>
      </div>
      {playReason && <p className="muted">{playReason}</p>}
      {error && <p className="error">{error}</p>}
      {dayDoc && dayDoc.games.length === 0 ? (
        <p className="muted">The games for this day are drawn when the day before is played.</p>
      ) : (
        <ul className="jc-games">
          {(dayDoc?.games ?? []).map(g => {
            const r = results.get(g.gameNo);
            const awayWon = !!r && r.awayPts > r.homePts;
            const homeWon = !!r && r.homePts > r.awayPts;
            return (
              <li key={g.gameNo} className={`jc-game${r ? '' : ' jc-unplayed'}`}>
                <span className={awayWon ? 'jc-winner' : undefined}>{teamCell(g.away)}</span>
                <span className="jc-score">{r ? `${r.awayPts}–${r.homePts}` : 'vs'}</span>
                <span className={homeWon ? 'jc-winner' : undefined}>{teamCell(g.home)}</span>
              </li>
            );
          })}
        </ul>
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
