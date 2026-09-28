import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lineup, recordGames } from '../../engine/season/moves';
import { type Possession, simGame, type SimGame, winProbability } from '../../engine/season/sim';
import { blockingPause, gamesPlayed, playerName, type SeasonState } from '../../engine/season/state';
import type { GameResult } from '../../engine/shared/types';
import { useSaving } from '../api';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';

const SPEED_MS = { slow: 700, normal: 250, fast: 40 } as const;
const CLUTCH_MS = 1200;
const periodName = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);

function LineScore({ home, away, periods }: { home: string; away: string; periods: { home: number[]; away: number[] } }) {
  return (
    <table className="line-score">
      <thead><tr><th></th>{periods.home.map((_, i) => <th key={i} className="n">{periodName(i + 1)}</th>)}<th className="n">T</th></tr></thead>
      <tbody>
        <tr><td>{away}</td>{periods.away.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n">{periods.away.reduce((a, b) => a + b, 0)}</td></tr>
        <tr><td>{home}</td>{periods.home.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n">{periods.home.reduce((a, b) => a + b, 0)}</td></tr>
      </tbody>
    </table>
  );
}

function BoxTable({ state, title, lines }: { state: SeasonState; title: string; lines: { playerId: string; pts: number }[] }) {
  return (
    <table className="box-score">
      <thead><tr><th>{title}</th><th className="n">PTS</th></tr></thead>
      <tbody>{lines.map(l => <tr key={l.playerId}><td>{playerName(state, l.playerId)}</td><td className="n">{l.pts}</td></tr>)}</tbody>
    </table>
  );
}

function FinalView({ state, r }: { state: SeasonState; r: GameResult }) {
  return (
    <section>
      <h1>Final{r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}: {r.away} {r.awayPts} @ {r.home} {r.homePts}</h1>
      {r.periods && <LineScore home={r.home} away={r.away} periods={r.periods} />}
      {r.box && (
        <div className="live-grid">
          <BoxTable state={state} title={r.away} lines={r.box.away} />
          <BoxTable state={state} title={r.home} lines={r.box.home} />
        </div>
      )}
    </section>
  );
}

function playText(state: SeasonState, g: SimGame, p: Possession): string {
  const off = p.offense === 'home' ? g.home : g.away;
  const def = p.offense === 'home' ? g.away : g.home;
  const who = playerName(state, off.players[p.handler].playerId);
  const guard = playerName(state, def.players[p.defender].playerId);
  return p.made ? `${off.teamId}: ${who} scores ${p.points} over ${guard}` : `${off.teamId}: ${who} is stopped by ${guard}`;
}

export function GamePage() {
  const { league = '', gameNo = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const n = Number(gameNo);
  const { state, versions, error } = useSeasonState(lg);
  const saving = useSaving();
  const [sim, setSim] = useState<SimGame | null>(null);
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEED_MS>('normal');
  const [saveState, setSaveState] = useState<'live' | 'saving' | 'saved' | 'failed'>('live');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<number[]>([]);

  const isNext = !!state?.schedule && !!state.results && gamesPlayed(state) + 1 === n && !blockingPause(state);

  useEffect(() => {
    if (!state || sim || !isNext) return;
    const g = state.schedule!.games[n - 1];
    const home = lineup(state, g.home);
    const away = lineup(state, g.away);
    if (typeof home === 'string' || typeof away === 'string') {
      setMessage(typeof home === 'string' ? home : (away as string));
      return;
    }
    setSim(simGame(n, home, away, Math.random));
  }, [state, sim, isNext, n]);

  const done = !!sim && shown >= sim.possessions.length;

  useEffect(() => {
    if (!auto || !sim || done) return;
    const delay = sim.possessions[shown].clutch ? CLUTCH_MS : SPEED_MS[speed];
    const t = setTimeout(() => setShown(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [auto, sim, shown, speed, done]);

  const prob = useMemo(() => (sim ? winProbability(sim, shown, Math.random, 200) : 0.5), [sim, shown]);
  useEffect(() => { if (sim) setHistory(h => [...h.slice(0, shown), prob]); }, [sim, shown, prob]);

  const save = async () => {
    if (!state || !sim) return;
    setSaveState('saving');
    const r = recordGames(state, [sim]);
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      setSaveState('failed');
      return;
    }
    try {
      await commitSeason(r, versions);
      setSaveState('saved');
    } catch (e) {
      setMessage((e as Error).message);
      setSaveState('failed');
    }
  };

  const autoSaved = useRef(false);
  useEffect(() => {
    if (done && saveState === 'live' && !autoSaved.current) {
      autoSaved.current = true;
      void save();
    }
  });

  useEffect(() => {
    if (!sim || done) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sim, done]);

  if (!lg) return <p className="error">Games are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const stored = state.results?.games[n - 1];
  if (stored && !sim) return <FinalView state={state} r={stored} />;
  if (!sim) {
    return (
      <section>
        <p className="muted">{message || (blockingPause(state) ? 'Finish the pause before playing on.' : "This game isn't up next.")}</p>
        <Link to={`/league/${lg}/scores`}>Back to scores ▸</Link>
      </section>
    );
  }

  const last = shown > 0 ? sim.possessions[shown - 1] : null;
  const end = last ? last.end : 120;
  const periods = { home: [] as number[], away: [] as number[] };
  const box = { home: [0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] };
  for (const p of sim.possessions.slice(0, shown)) {
    while (periods.home.length < p.period) { periods.home.push(0); periods.away.push(0); }
    periods[p.offense][p.period - 1] += p.points;
    box[p.offense][p.handler] += p.points;
  }
  const lines = (side: 'home' | 'away') => sim[side].players.map((pl, k) => ({ playerId: pl.playerId, pts: box[side][k] }));
  const points = history.map((v, i) => `${(i / Math.max(1, sim.possessions.length)) * 300},${60 - v * 60}`).join(' ');

  return (
    <section>
      <div className="scorebug">
        <span>{sim.away.teamId}</span><span className="score">{last?.awayScore ?? 0}</span>
        <span className="clock">{done ? `Final${sim.ot ? ` (${sim.ot > 1 ? `${sim.ot}OT` : 'OT'})` : ''}` : `${periodName(last ? last.period : 1)} · ${end - shown} possessions left`}</span>
        <span className="score">{last?.homeScore ?? 0}</span><span>{sim.home.teamId}</span>
      </div>
      <div className="sim-controls">
        <button className="btn" disabled={done || auto} onClick={() => setShown(s => s + 1)}>Next possession</button>
        <button className="btn" disabled={done} onClick={() => setAuto(a => !a)}>{auto ? 'Pause' : 'Auto'}</button>
        <label>Speed
          <select value={speed} onChange={e => setSpeed(e.target.value as keyof typeof SPEED_MS)}>
            <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
          </select>
        </label>
        <button className="btn primary" disabled={done} onClick={() => setShown(sim.possessions.length)}>Sim to end</button>
        {!done && <span className="muted">This game isn't saved until the final buzzer.</span>}
        {saveState === 'saved' && <Link to={`/league/${lg}/scores`}>Saved · back to scores ▸</Link>}
        {saveState === 'failed' && <button className="btn" disabled={saving} onClick={save}>Retry save</button>}
      </div>
      {message && <p className="error">{message}</p>}
      <div className="live-grid">
        <div className="card">
          <h3>Play-by-play</h3>
          <ul className="pbp">
            {sim.possessions.slice(Math.max(0, shown - 15), shown).reverse().map(p => (
              <li key={p.i} className={p.clutch ? 'clutch' : undefined}>{periodName(p.period)} · {playText(state, sim, p)}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Win probability · {sim.home.teamId} {Math.round(prob * 100)}%</h3>
          <svg viewBox="0 0 300 60" width="100%" height="60" role="img" aria-label="Win probability">
            <line x1="0" y1="30" x2="300" y2="30" stroke="currentColor" strokeOpacity="0.2" />
            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
          </svg>
          <LineScore home={sim.home.teamId} away={sim.away.teamId} periods={periods} />
          <BoxTable state={state} title={sim.away.teamId} lines={lines('away')} />
          <BoxTable state={state} title={sim.home.teamId} lines={lines('home')} />
        </div>
      </div>
    </section>
  );
}
