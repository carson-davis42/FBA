import { useState } from 'react';
import { Link } from 'react-router-dom';
import { gameDays } from '../../engine/season/schedule';
import type { QualifyingFile, Team } from '../../engine/shared/types';
import { qualifyingTable } from '../../engine/wc/qualifying';
import { Badge } from '../components/Badge';
import { TeamName } from '../components/TeamName';
import '../pages/season.css';

/** The qualifying games by game day, like the other leagues' Scores page: one card per game, a day strip to move between days. */
export function QualifyingScores({ q, byId, season, canWatch }: { q: QualifyingFile; byId: Map<string, Team>; season: number; canWatch: boolean }) {
  const [day, setDay] = useState<number | null>(null);
  const days = gameDays(q.schedule);
  const played = q.games.length;
  const currentDay = days.findIndex(d => d.includes(played + 1));
  const shownDay = Math.max(0, Math.min(day ?? (currentDay >= 0 ? currentDay : days.length - 1), days.length - 1));
  const recs = new Map(qualifyingTable(q).rows.map(r => [r.teamId, `${r.w}-${r.l}`]));
  const line = (id: string, pts: number | null, won: boolean) => {
    const t = byId.get(id);
    return (
      <div className={`team-line${won ? ' won' : ''}`}>
        {t ? <TeamName team={t} season={season} variant="abbr" size={24} /> : <span>{id}</span>}
        <span className="rec">{played > 0 ? recs.get(id) ?? '' : ''}</span>
        <span className="pts">{pts ?? ''}</span>
      </div>
    );
  };
  if (days.length === 0) return <p className="muted">No games scheduled.</p>;
  return (
    <>
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
        {days[shownDay].map(n => {
          const g = q.schedule[n - 1];
          const r = q.games[n - 1];
          const isNext = !r && n === played + 1 && canWatch;
          return (
            <div key={n} className={`card game-card${isNext ? ' next' : ''}`}>
              <div className="game-head">
                <div className="game-status">Game {n} · {r ? `Final${r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}` : isNext ? 'Next' : 'Upcoming'}</div>
                {r ? <Badge kind="final">final</Badge> : isNext ? <Badge kind="current">next</Badge> : null}
              </div>
              {line(g.away, r ? r.awayPts : null, !!r && r.awayPts > r.homePts)}
              {line(g.home, r ? r.homePts : null, !!r && r.homePts > r.awayPts)}
              <div className="game-links">
                {r && <Link to={`/league/fbawc/game/${n}`}>Box score</Link>}
                {isNext && <Link to={`/league/fbawc/game/${n}`}>Watch</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
