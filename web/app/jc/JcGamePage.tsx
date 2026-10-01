import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roundName } from '../../engine/jc/bracket';
import { lineupOf } from '../../engine/jc/play';
import { nextPostGame, postseasonStage, recordPostGame, tournamentProblem, type PostTournament } from '../../engine/jc/postseason';
import { jcWrites, type JcState } from '../../engine/jc/state';
import type { SeasonLeague } from '../../engine/season/schedule';
import { JC_PROFILE, simGame, type SimGame } from '../../engine/season/sim';
import type { SeasonState } from '../../engine/season/state';
import type { Bracket, BracketGame, GameResult } from '../../engine/shared/types';
import { PageHeader } from '../components/PageHeader';
import { commitDocs } from '../roster/commit';
import { FinalView } from '../season/GameViews';
import { LiveGame } from '../season/LiveGame';
import { usePostseasonDocs } from './usePostseasonDocs';
import '../pages/season.css';

/** The slice of a college season the shared game views read (names, teams, colours). */
export function viewState(s: JcState): SeasonState {
  return { league: 'fbajc' as unknown as SeasonLeague, season: s.season, teams: s.teams, rosters: s.rosters, players: s.players } as unknown as SeasonState;
}

export interface GameInfo { result: GameResult; bracket: Bracket | null; game: BracketGame | null }

/** A played game by number: regular season, conference tournament, NIT or March Madness. */
export function findGame(state: JcState, gameNo: number): GameInfo | null {
  const regular = state.results?.games.find(g => g.gameNo === gameNo);
  if (regular) return { result: regular, bracket: null, game: null };
  const ps = state.postseason;
  for (const b of [...(ps?.conf ?? []), ps?.nit ?? null, ps?.mm ?? null]) {
    const game = b?.games.find(g => g.result?.gameNo === gameNo);
    if (b && game) return { result: game.result!, bracket: b, game };
  }
  return null;
}

/** The tournament whose next game this number is, if it can be played live right now. */
export function liveTournament(state: JcState, gameNo: number): PostTournament | null {
  const stage = postseasonStage(state);
  const which: PostTournament | null = stage === 'nit' ? 'nit' : stage === 'mm' ? 'mm' : null;
  if (!which || tournamentProblem(state, which) || state.postseason?.nextGameNo !== gameNo) return null;
  return nextPostGame(state, which) ? which : null;
}

export function JcGamePage() {
  const { gameNo = '' } = useParams();
  return <JcGame key={gameNo} />;
}

function JcGame() {
  const { gameNo = '' } = useParams();
  const n = Number(gameNo);
  const { season, docs } = usePostseasonDocs();
  const [sim, setSim] = useState<SimGame | null>(null);
  const [message, setMessage] = useState('');
  const state = docs.state;
  const which = state ? liveTournament(state, n) : null;

  useEffect(() => {
    if (!state || sim || !which) return;
    const next = nextPostGame(state, which)!;
    const home = lineupOf(state.rosters.teams[next.home!], next.home!);
    const away = lineupOf(state.rosters.teams[next.away!], next.away!);
    if (typeof home === 'string' || typeof away === 'string') {
      setMessage(typeof home === 'string' ? home : (away as string));
      return;
    }
    setSim(simGame(n, home, away, Math.random, JC_PROFILE));
  }, [state, sim, which, n]);

  if (season === null || docs.error) return <p className={docs.error ? 'error' : 'muted'}>{docs.error || 'Loading…'}</p>;
  if (docs.missing) return <p className="muted">{docs.missing}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const view = viewState(state);
  const back = { to: '/league/fbajc/postseason', label: 'back to the postseason ▸' };
  const found = findGame(state, n);

  if (found && !sim) {
    const { bracket, game } = found;
    return (
      <div className="stack">
        {bracket && game && <p className="page-kicker">{bracket.kind === 'conf' ? `${bracket.id} tournament` : bracket.name} · {roundName(bracket.kind, game.round)}</p>}
        <FinalView state={view} r={found.result} />
        <p><Link className="btn" to={bracket ? back.to : '/league/fbajc/scores'}>{bracket ? 'Back to the postseason ▸' : 'Back to scores ▸'}</Link></p>
      </div>
    );
  }
  if (!sim) {
    return (
      <section className="stack">
        <PageHeader kicker="FBAJC" title={`Game ${gameNo}`} />
        <p className="muted">{message || (n > 0 ? "This game hasn't been played, and it isn't up next." : 'There is no such game.')}</p>
        <p><Link className="btn" to={back.to}>Back to the postseason ▸</Link></p>
      </section>
    );
  }
  const save = async () => {
    const r = recordPostGame(state, which!, sim);
    if (!r.ok) throw new Error(r.problems.join('; '));
    await commitDocs(r.label, jcWrites(r), docs.versions);
  };
  return <LiveGame state={view} sim={sim} save={save} back={back} />;
}
