import { useCallback, useMemo, useState } from 'react';
import { pointsFor, toSimGame } from '../../engine/allstar/exhibition';
import { ysgTeams } from '../../engine/allstar/youngStars';
import type { SeasonState } from '../../engine/season/state';
import type { AllStarFile, ExhibitionGame } from '../../engine/shared/types';
import { ChampBadge, SideRow } from '../playoffs/Bracket';
import '../playoffs/playoffs.css';
import { LiveGame } from '../season/LiveGame';
import { PlayerName } from '../components/PlayerName';

const TITLES = ['Semifinal 1', 'Semifinal 2', 'Final'] as const;
const overtime = (g: ExhibitionGame) => (g.ot === 0 ? '' : g.ot === 1 ? 'OT' : `${g.ot}OT`);

interface Common {
  state: SeasonState;
  doc: NonNullable<AllStarFile>;
  name: (id: string) => string;
  /** True while the games are being watched for the first time: scores and winners show only once a game has been played through. */
  reveal: boolean;
  /** Called when the person is done looking at the finished games (the Continue button). */
  onAllDone: () => void;
}

/** The four-team Young-Star bracket. Open a game to step through it (possession by possession, with play-by-play and box score); the final unlocks after both semifinals. */
export function YsgTournament({ state, doc, name, reveal, onAllDone }: Common) {
  const ysg = doc.ysg!;
  const games = [ysg.semis[0], ysg.semis[1], ysg.final];
  const label = (t: number) => `Team ${name(doc.selections!.youngCaptains[t])}`;
  const [done, setDone] = useState<Set<number>>(() => new Set(reveal ? [] : [0, 1, 2]));
  const [open, setOpen] = useState<number | null>(reveal ? 0 : null);
  const finish = useCallback((k: number) => setDone(prev => (prev.has(k) ? prev : new Set(prev).add(k))), []);
  const available = (k: number) => k < 2 || (done.has(0) && done.has(1));
  const sim = useMemo(() => (open === null ? null : toSimGame(games[open], [label(games[open].teams[0]), label(games[open].teams[1])])), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const champion = done.size === 3;
  const roster = ysgTeams(doc)[ysg.champion];
  const mvpPts = pointsFor(games, roster).get(ysg.mvp) ?? 0;

  const box = (k: number) => {
    const g = games[k];
    const known = k < 2 || available(k);
    const finished = done.has(k);
    const side = (s: 0 | 1) => (
      <SideRow
        key={s}
        seed=""
        name={known ? label(g.teams[s]) : 'TBD'}
        wins={finished ? g.scores[s] : null}
        won={finished && g.winner === g.teams[s]}
      />
    );
    return (
      <button key={k} type="button" disabled={!available(k)} className={`series-box${k === 2 ? ' finals' : ''}${finished ? ' decided' : ''}${open === k ? ' selected' : ''}`}
        aria-label={`${TITLES[k]}${finished ? ' (played)' : ''}`} onClick={() => setOpen(open === k ? null : k)}>
        {k === 2 && champion && <ChampBadge />}
        {side(0)}
        {side(1)}
        {finished && g.ot > 0 && <span className="muted" style={{ padding: '2px 10px' }}>{overtime(g)}</span>}
      </button>
    );
  };

  return (
    <div className="stack">
      <div className="bracket" aria-label="Young-Star bracket">
        <div className="bracket-col l">{[0, 1].map(box)}</div>
        <div className="bracket-col end">{box(2)}</div>
      </div>
      {reveal && !champion && (
        <div className="sim-controls">
          <button className="btn" onClick={() => { setDone(new Set([0, 1, 2])); setOpen(null); }}>Sim the whole tournament</button>
          <span className="muted">Open a game to watch it, or sim them all.</span>
        </div>
      )}
      {champion && (
        <div className="sim-controls">
          <p className="champ-line"><strong>Champions: {label(ysg.champion)}</strong> · MVP <PlayerName id={ysg.mvp} name={name(ysg.mvp)} /> ({mvpPts} pts across its games)</p>
          {reveal && <button className="btn primary" onClick={onAllDone}>Continue</button>}
        </div>
      )}
      {sim && open !== null && (
        <LiveGame key={open} state={state} sim={sim} exhibition={{ kicker: `Young-Star tournament · ${TITLES[open]}` }} startDone={done.has(open)} onDone={() => finish(open)} />
      )}
    </div>
  );
}

/** The All-Star Game: stepped through like any game, with the quarter rotations, then the MVP. */
export function AsgGame({ state, doc, name, reveal, onAllDone }: Common) {
  const { game, mvp } = doc.asg!;
  const label = (t: number) => `Team ${name(doc.selections!.captains[t])}`;
  const sim = useMemo(() => toSimGame(game, [label(game.teams[0]), label(game.teams[1])]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [done, setDone] = useState(!reveal);
  const finish = useCallback(() => setDone(true), []);
  const winnerRoster = game.rosters[game.teams.indexOf(game.winner)].map(r => r.playerId);
  const pts = pointsFor([game], winnerRoster).get(mvp) ?? 0;
  return (
    <div className="stack">
      <LiveGame state={state} sim={sim} exhibition={{ kicker: 'All-Star Game' }} startDone={!reveal} onDone={finish} />
      {done && (
        <div className="sim-controls">
          <p className="champ-line"><strong>{label(game.winner)} win</strong> · MVP <PlayerName id={mvp} name={name(mvp)} /> ({pts} pts)</p>
          {reveal && <button className="btn primary" onClick={onAllDone}>Continue</button>}
        </div>
      )}
    </div>
  );
}
