import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roundName } from '../../engine/playoffs/bracket';
import { nextPlayoffGame, recordPlayoffGame } from '../../engine/playoffs/moves';
import { leagueStepProblem, lineup } from '../../engine/season/moves';
import { simGame, type SimGame } from '../../engine/season/sim';
import { commitSeason } from '../season/commitSeason';
import { FinalView } from '../season/GameViews';
import { LiveGame } from '../season/LiveGame';
import { useSeasonState } from '../season/useSeasonState';
import '../pages/season.css';

/** Keyed on the game number, so changing the URL starts fresh instead of keeping another game's live sim. */
export function PlayoffGamePage() {
  const { n = '' } = useParams();
  return <PlayoffGame key={n} />;
}

function PlayoffGame() {
  const { league = '', n = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const gameNo = Number(n);
  const { state, versions, error } = useSeasonState(lg);
  const [sim, setSim] = useState<SimGame | null>(null);
  const [message, setMessage] = useState('');

  const stepProblem = state && lg ? leagueStepProblem(state.calendar, lg) : null;
  const isNext = !!state && nextPlayoffGame(state.playoffs)?.gameNo === gameNo && !stepProblem;

  useEffect(() => {
    if (!state || sim || !isNext) return;
    const next = nextPlayoffGame(state.playoffs)!;
    const home = lineup(state, next.home);
    const away = lineup(state, next.away);
    if (typeof home === 'string' || typeof away === 'string') {
      setMessage(typeof home === 'string' ? home : (away as string));
      return;
    }
    setSim(simGame(next.gameNo, home, away, Math.random));
  }, [state, sim, isNext]);

  if (!lg) return <p className="error">Playoff games are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const stored = state.playoffs?.games[gameNo - 1];
  if (stored && !sim) {
    const storedSeries = state.playoffs!.series.find(s => s.id === stored.seriesId);
    return (
      <>
        {storedSeries && (
          <p className="muted">Playoff game {gameNo} · {roundName(lg, storedSeries)}, game {stored.gameInSeries}</p>
        )}
        <FinalView state={state} r={stored} />
        <Link to={`/league/${lg}/playoffs`}>Back to the playoffs ▸</Link>
      </>
    );
  }
  if (!sim) {
    return (
      <section>
        <p className="muted">{message || stepProblem || "This isn't the next playoff game."}</p>
        <Link to={`/league/${lg}/playoffs`}>Back to the playoffs ▸</Link>
      </section>
    );
  }

  const pf = state.playoffs!;
  const game = pf.games[sim.gameNo - 1];
  const next = nextPlayoffGame(pf);
  const seriesId = game?.seriesId ?? next?.seriesId;
  const series = pf.series.find(s => s.id === seriesId);
  const gameInSeries = game?.gameInSeries ?? next?.gameInSeries;
  const save = async () => {
    const r = recordPlayoffGame(state, sim);
    if (!r.ok) throw new Error(r.problems.join('; '));
    await commitSeason(r, versions);
  };
  return (
    <>
      {series && <p className="muted">Playoff game {sim.gameNo} · {roundName(lg, series)}, game {gameInSeries}</p>}
      <LiveGame state={state} sim={sim} save={save} back={{ to: `/league/${lg}/playoffs`, label: 'back to the playoffs ▸' }} />
    </>
  );
}
