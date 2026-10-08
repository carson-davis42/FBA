import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { type Possession, type SimGame, winProbability } from '../../engine/season/sim';
import { playerName, type SeasonState } from '../../engine/season/state';
import { groupLabel, LEAGUE_LABEL } from '../../engine/shared/leagues';
import { useSaving } from '../api';
import { WinProbChart } from './WinProbChart';
import { ACCENT_SIDES, BoxTable, bugSide, LineScore, periodName, ScoreBug, teamLabel } from './GameViews';
import '../pages/season.css';
import { PlayerName } from '../components/PlayerName';

const SPEED_MS = { slow: 700, normal: 250, fast: 40 } as const;
const CLUTCH_MS = 1200;

function playText(state: SeasonState, g: SimGame, p: Possession): ReactNode {
  const off = p.offense === 'home' ? g.home : g.away;
  const def = p.offense === 'home' ? g.away : g.home;
  const hid = off.players[p.handler].playerId, did = def.players[p.defender].playerId;
  const who = <PlayerName id={hid} name={playerName(state, hid)} />;
  const guard = <PlayerName id={did} name={playerName(state, did)} />;
  return p.made ? <>{off.teamId}: {who} scores {p.points} over {guard}</> : <>{off.teamId}: {who} is stopped by {guard}</>;
}

export interface LiveGameProps {
  state: SeasonState;
  sim: SimGame;
  /** Saves the finished game; throws an Error with a readable message if it can't. Leave it out for a game that is already saved. */
  save?: () => Promise<void>;
  /** Where the "Saved" link goes. */
  back?: { to: string; label: string };
  /** An exhibition (All-Star) game: `sim.home.teamId` and `sim.away.teamId` are display names, not teams, and `kicker` heads the page. */
  exhibition?: { kicker: string };
  /** Opens with every possession already shown (looking back at a finished game). */
  startDone?: boolean;
  /** Called once, when the last possession has been shown. */
  onDone?: () => void;
}

/** The live viewer: possessions revealed one at a time, saved once at the final buzzer. */
export function LiveGame({ state, sim, save, back, exhibition, startDone, onDone }: LiveGameProps) {
  const saving = useSaving();
  const [shown, setShown] = useState(startDone ? sim.possessions.length : 0);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEED_MS>('normal');
  const [saveState, setSaveState] = useState<'live' | 'saving' | 'saved' | 'failed'>('live');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<number[]>(() => (startDone ? Array.from({ length: sim.possessions.length + 1 }, (_, i) => winProbability(sim, i, Math.random, 40)) : []));
  const done = shown >= sim.possessions.length;

  useEffect(() => {
    if (!auto || done) return;
    const delay = sim.possessions[shown].clutch ? CLUTCH_MS : SPEED_MS[speed];
    const t = setTimeout(() => setShown(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [auto, sim, shown, speed, done]);

  const prob = useMemo(() => winProbability(sim, shown, Math.random, 200), [sim, shown]);
  useEffect(() => { setHistory(h => [...h.slice(0, shown), prob]); }, [shown, prob]);

  const runSave = async () => {
    if (!save) return;
    setSaveState('saving');
    setMessage('');
    try {
      await save();
      setSaveState('saved');
    } catch (e) {
      setMessage((e as Error).message);
      setSaveState('failed');
    }
  };

  // Guarded by a ref: useSaving() forces an extra render when the save starts, which would save twice.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (done && saveState === 'live' && !autoSaved.current) {
      autoSaved.current = true;
      void runSave();
    }
  });
  const doneCalled = useRef(false);
  useEffect(() => {
    if (done && !doneCalled.current) {
      doneCalled.current = true;
      onDone?.();
    }
  }, [done, onDone]);

  useEffect(() => {
    if (done || !save) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [done, save]);

  const last = shown > 0 ? sim.possessions[shown - 1] : null;
  const end = last ? last.end : 120;
  const periods = { home: [] as number[], away: [] as number[] };
  const box = { home: sim.home.players.map(() => 0), away: sim.away.players.map(() => 0) };
  for (const p of sim.possessions.slice(0, shown)) {
    while (periods.home.length < p.period) { periods.home.push(0); periods.away.push(0); }
    periods[p.offense][p.period - 1] += p.points;
    box[p.offense][p.handler] += p.points;
  }
  const lines = (side: 'home' | 'away') => sim[side].players.map((pl, k) => ({ playerId: pl.playerId, pts: box[side][k] }));

  // The conference or division the two teams play in (both, when they differ).
  const groups = [...new Set([sim.home.teamId, sim.away.teamId].map(id => state.teams.teams.find(t => t.teamId === id)?.group ?? null))]
    .filter((g): g is string => g !== null).map(g => groupLabel(state.league, g));

  return (
    <section className="stack">
      <p className="page-kicker">{exhibition?.kicker ?? [LEAGUE_LABEL[state.league] ?? state.league, ...groups, `S${state.season}`].join(' · ')}</p>
      <ScoreBug
        away={exhibition ? { label: sim.away.teamId, score: last?.awayScore ?? 0, style: ACCENT_SIDES[1] } : bugSide(state, sim.away.teamId, last?.awayScore ?? 0, { full: true, record: true })}
        home={exhibition ? { label: sim.home.teamId, score: last?.homeScore ?? 0, style: ACCENT_SIDES[0] } : bugSide(state, sim.home.teamId, last?.homeScore ?? 0, { full: true, record: true })}
        middle={done ? `Final${sim.ot ? ` (${sim.ot > 1 ? `${sim.ot}OT` : 'OT'})` : ''}` : `${periodName(last ? last.period : 1)} · ${end - shown} possessions left`}
      />
      <div className="card sim-controls">
        <button className="btn" disabled={done || auto} onClick={() => setShown(s => s + 1)}>Next possession</button>
        <button className="btn" disabled={done} onClick={() => setAuto(a => !a)}>{auto ? 'Pause' : 'Auto'}</button>
        <label>Speed
          <select value={speed} onChange={e => setSpeed(e.target.value as keyof typeof SPEED_MS)}>
            <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
          </select>
        </label>
        <button className="btn primary" disabled={done} onClick={() => setShown(sim.possessions.length)}>Sim to end</button>
        {!done && save && <span className="muted">This game isn't saved until the final buzzer.</span>}
        {saveState === 'saved' && back && <Link to={back.to}>Saved · {back.label}</Link>}
        {saveState === 'failed' && <button className="btn" disabled={saving} onClick={runSave}>Retry save</button>}
      </div>
      {message && <p className="error">{message}</p>}
      <div className="live-grid">
        <div className="card headed">
          <div className="card-head"><h3>Play-by-play</h3></div>
          <ul className="pbp">
            {sim.possessions.slice(Math.max(0, shown - 15), shown).reverse().map(p => (
              <li key={p.i} className={[p.clutch ? 'clutch' : '', p.made ? 'score' : ''].filter(Boolean).join(' ') || undefined}>{periodName(p.period)} · {playText(state, sim, p)}</li>
            ))}
          </ul>
        </div>
        <div className="card headed stack">
          <div className="card-head"><h3>Win probability</h3></div>
          <WinProbChart state={state} sim={sim} history={history} prob={prob} />
          <LineScore home={teamLabel(state, sim.home.teamId)} away={teamLabel(state, sim.away.teamId)} periods={periods} />
          <BoxTable state={state} title={teamLabel(state, sim.away.teamId)} lines={lines('away')} />
          <BoxTable state={state} title={teamLabel(state, sim.home.teamId)} lines={lines('home')} />
        </div>
      </div>
    </section>
  );
}
