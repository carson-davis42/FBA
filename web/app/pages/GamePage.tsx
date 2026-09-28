import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leagueStepProblem, lineup, recordGames } from '../../engine/season/moves';
import { simGame, type SimGame } from '../../engine/season/sim';
import { blockingPause, gamesPlayed } from '../../engine/season/state';
import { commitSeason } from '../season/commitSeason';
import { FinalView } from '../season/GameViews';
import { LiveGame } from '../season/LiveGame';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';

export function GamePage() {
  const { league = '', gameNo = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const n = Number(gameNo);
  const { state, versions, error } = useSeasonState(lg);
  const [sim, setSim] = useState<SimGame | null>(null);
  const [message, setMessage] = useState('');

  const stepProblem = state && lg ? leagueStepProblem(state.calendar, lg) : null;
  const isNext = !!state?.schedule && !!state.results && gamesPlayed(state) + 1 === n && !blockingPause(state) && !stepProblem;

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

  if (!lg) return <p className="error">Games are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const stored = state.results?.games[n - 1];
  if (stored && !sim) return <FinalView state={state} r={stored} />;
  if (!sim) {
    return (
      <section>
        <p className="muted">{message || (blockingPause(state) ? 'Finish the pause before playing on.' : stepProblem || "This game isn't up next.")}</p>
        <Link to={`/league/${lg}/scores`}>Back to scores ▸</Link>
      </section>
    );
  }

  const save = async () => {
    const r = recordGames(state, [sim]);
    if (!r.ok) throw new Error(r.problems.join('; '));
    await commitSeason(r, versions);
  };
  return <LiveGame state={state} sim={sim} save={save} back={{ to: `/league/${lg}/scores`, label: 'back to scores ▸' }} />;
}
