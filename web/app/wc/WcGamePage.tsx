import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SeasonLeague } from '../../engine/season/schedule';
import type { SimGame } from '../../engine/season/sim';
import type { SeasonState } from '../../engine/season/state';
import type { GameResult, MetaFile, PlayersFile } from '../../engine/shared/types';
import { nextQualifyingGame, recordQualifyingGame, type QualifyingState } from '../../engine/wc/qualifying';
import { simWcGame, type NextWcGame, type WcResult } from '../../engine/wc/state';
import { wcWrites } from '../../engine/wc/writes';
import { nextGroupGame, nextKnockoutGame, recordGroupGame, recordKnockoutGame, type WorldCupState } from '../../engine/wc/worldcup';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { commitDocs } from '../roster/commit';
import { FinalView } from '../season/GameViews';
import { LiveGame } from '../season/LiveGame';
import '../pages/season.css';
import { useWcDocs, type WcDocs } from './useWcDocs';

/** Generated players ("<team>:<position>") get readable names, so the shared game views can print them. */
function viewState(docs: WcDocs, season: number): SeasonState {
  const players: PlayersFile = docs.players ?? { nextId: 1, players: {} };
  const names: PlayersFile['players'] = { ...players.players };
  for (const teamId of Object.keys(docs.rosters?.teams ?? {})) {
    const abbr = docs.teams?.teams.find(t => t.teamId === teamId)?.abbr ?? teamId;
    for (const pos of ['PG', 'SG', 'SF', 'PF', 'C']) {
      const id = `${teamId}:${pos}`;
      if (!names[id]) names[id] = { id, name: `${abbr} ${pos}`, birthSeason: null } as PlayersFile['players'][string];
    }
  }
  return { league: 'fbawc' as unknown as SeasonLeague, season, teams: docs.teams!, rosters: docs.rosters!, players: { ...players, players: names } } as unknown as SeasonState;
}

interface Found { result: GameResult; label: string }

/** A played game of the current season by number: a qualifying game (odd seasons) or a World Cup group or knockout game (even seasons). */
export function findWcGame(docs: WcDocs, season: number, n: number): Found | null {
  if (season % 2 !== 0) {
    const g = docs.qualifying?.games[n - 1];
    return g ? { result: g, label: 'Qualifying' } : null;
  }
  const wc = docs.worldCup;
  const group = wc?.groupGames[n - 1];
  if (group) return { result: group, label: 'Group stage' };
  const ko = wc?.knockout.find(k => k.game?.gameNo === n);
  return ko?.game ? { result: ko.game, label: `Knockout · ${ko.id}` } : null;
}

export function WcGamePage() {
  const { gameNo = '' } = useParams();
  return <WcGame key={gameNo} />;
}

function WcGame() {
  const { gameNo = '' } = useParams();
  const n = Number(gameNo);
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason ?? null;
  const docs = useWcDocs(season);
  const [sim, setSim] = useState<SimGame | null>(null);
  const [message, setMessage] = useState('');

  const calendar = docs.calendar;
  const odd = season !== null && season % 2 !== 0;
  const qState: QualifyingState | null = calendar && docs.qualifying && docs.rosters ? { calendar, rosters: docs.rosters, qualifying: docs.qualifying } : null;
  const wState: WorldCupState | null = calendar && docs.worldCup && docs.rosters ? { calendar, rosters: docs.rosters, worldCup: docs.worldCup } : null;

  type Live = { next: NextWcGame; record: (s: SimGame) => WcResult<QualifyingState | WorldCupState> };
  const live = (): Live | null => {
    if (odd) {
      const next = qState ? nextQualifyingGame(qState) : null;
      return qState && next && typeof next !== 'string' && next.gameNo === n ? { next, record: s => recordQualifyingGame(qState, s) } : null;
    }
    if (!wState) return null;
    const group = nextGroupGame(wState);
    if (typeof group !== 'string' && group.gameNo === n) return { next: group, record: s => recordGroupGame(wState, s) };
    if (wState.worldCup!.knockout.length > 0) {
      const ko = nextKnockoutGame(wState);
      if (typeof ko !== 'string' && ko.gameNo === n) return { next: ko, record: s => recordKnockoutGame(wState, s) };
    }
    return null;
  };
  const ready = docs.ready && !!calendar && !!docs.teams && !!docs.rosters;
  const current = ready && !sim ? live() : null;

  useEffect(() => {
    if (!current || sim) return;
    const made = simWcGame(docs.rosters!, current.next, Math.random);
    if (typeof made === 'string') setMessage(made);
    else setSim(made);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!current, sim]);

  if (docs.error) return <p className="error">{docs.error.message}</p>;
  if (season === null || !ready) return <p className="muted">Loading…</p>;
  const view = viewState(docs, season);
  const found = findWcGame(docs, season, n);
  const back = { to: odd ? '/league/fbawc/qualifying' : '/league/fbawc/worldcup', label: odd ? 'back to qualifying ▸' : 'back to the World Cup ▸' };

  if (found && !sim) {
    return (
      <div className="stack">
        <p className="page-kicker">{found.label}</p>
        <FinalView state={view} r={found.result} />
        <p><Link className="btn" to={back.to}>{back.label.replace('back', 'Back')}</Link></p>
      </div>
    );
  }
  if (!sim) {
    return (
      <section className="stack">
        <PageHeader kicker="World Cup" title={`Game ${gameNo}`} />
        <p className="muted">{message || "This game hasn't been played, and it isn't up next."}</p>
        <p><Link className="btn" to={back.to}>{back.label.replace('back', 'Back')}</Link></p>
      </section>
    );
  }
  const liveNow = live();
  const save = async () => {
    const r = liveNow ? liveNow.record(sim) : null;
    if (!r) throw new Error("This isn't the next game any more");
    if (!r.ok) throw new Error(r.problems.join('; '));
    await commitDocs(r.label, wcWrites(r), docs.versions);
  };
  return <LiveGame state={view} sim={sim} save={save} back={back} />;
}
