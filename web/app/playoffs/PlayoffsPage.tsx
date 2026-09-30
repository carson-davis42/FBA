import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roundName } from '../../engine/playoffs/bracket';
import { lockSeeds, nextPlayoffGame, seasonStandings, seedPreview } from '../../engine/playoffs/moves';
import { leagueStepProblem } from '../../engine/season/moves';
import type { SeasonLeague } from '../../engine/season/schedule';
import { blockingPause, PAUSE_LABEL, seasonOver, type SeasonState } from '../../engine/season/state';
import { groupLabel, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { PlayoffsFile, Team } from '../../engine/shared/types';
import { useSaving } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { TeamMark } from '../components/TeamMark';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { Bracket } from './Bracket';
import { FinalsMvpCard } from './FinalsMvpCard';
import { FinishSeasonCard } from './FinishSeasonCard';
import '../pages/season.css';

function SeedTables({ lg, state, seeds, teams }: { lg: SeasonLeague; state: SeasonState; seeds: PlayoffsFile['seeds']; teams: Map<string, Team> }) {
  const st = seasonStandings(state);
  return (
    <div className="seed-grid">
      {seeds.map(s => {
        const rows = new Map(st.groups.find(g => g.group === s.group)?.rows.map(r => [r.teamId, r]) ?? []);
        return (
          <div key={s.group} className="card">
            <h3>{groupLabel(lg, s.group)}</h3>
            <ol className="seed-list">
              {s.teams.map(id => {
                const t = teams.get(id);
                const r = rows.get(id);
                return (
                  <li key={id}>
                    {t && <TeamMark team={t} season={state.season} size={18} />} {t?.name ?? id}{' '}
                    {r && <span className="muted">{r.w}-{r.l}</span>}
                  </li>
                );
              })}
            </ol>
            {s.notes.length > 0 && <ul className="tie-notes">{s.notes.map(n => <li key={n} className="muted">{n}</li>)}</ul>}
          </div>
        );
      })}
    </div>
  );
}

export function PlayoffsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, versions, error } = useSeasonState(lg);
  const saving = useSaving();
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState('PL');

  if (!lg) return <p className="error">Playoffs are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <h1>{LEAGUE_LABEL[lg]} playoffs · S{state.season}</h1>
      <LeagueTabs league={lg} />
    </>
  );
  if (!state.schedule || !state.results) {
    return <section>{header}<p className="muted">No schedule yet. <Link to="/schedules">Make schedules ▸</Link></p></section>;
  }
  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const name = (id: string) => teams.get(id)?.name ?? id;
  const abbr = (id: string) => teams.get(id)?.abbr ?? id;
  const pf = state.playoffs;

  if (!pf) {
    const over = seasonOver(state);
    const pause = over ? blockingPause(state) : null;
    const stepProblem = leagueStepProblem(state.calendar, lg);
    const lock = async () => {
      setMessage('');
      const r = lockSeeds(state);
      if (!r.ok) {
        setMessage(r.problems.join('; '));
        return;
      }
      try {
        await commitSeason(r, versions);
      } catch (e) {
        setMessage((e as Error).message);
      }
    };
    return (
      <section>
        {header}
        {!over && <p className="muted">Playoffs start after game {state.schedule.games.length}. Projected seeds from the current standings:</p>}
        {pause && (
          <div className="card pause-card">
            <h3>Pause after game {pause.afterGame}: {PAUSE_LABEL[pause.kind]}</h3>
            {pause.kind === 'ratings' && <Link className="btn primary" to="/league/fba/ratings-pause">Adjust ratings ▸</Link>}
          </div>
        )}
        {over && !pause && stepProblem && <p className="muted">{stepProblem}</p>}
        <SeedTables lg={lg} state={state} seeds={seedPreview(state)} teams={teams} />
        {over && !pause && !stepProblem && !state.awards?.locked && (
          <div className="card pause-card">
            <h3>Awards step</h3>
            <p className="muted">Lock the S{state.season} awards before seeding the playoffs.</p>
            <Link className="btn primary" to={`/league/${lg}/awards`}>Awards step ▸</Link>
          </div>
        )}
        {over && !pause && !stepProblem && state.awards?.locked && <button className="btn primary" disabled={saving} onClick={lock}>Lock seeds</button>}
        {message && <p className="error">{message}</p>}
      </section>
    );
  }

  const next = nextPlayoffGame(pf);
  const nextSeries = next ? pf.series.find(s => s.id === next.seriesId)! : null;
  const lead = (() => {
    if (!nextSeries) return '';
    const { home, away, homeWins, awayWins } = nextSeries;
    if (homeWins === awayWins) return `Series tied ${homeWins}–${awayWins}`;
    return homeWins > awayWins ? `${abbr(home!)} leads ${homeWins}–${awayWins}` : `${abbr(away!)} leads ${awayWins}–${homeWins}`;
  })();
  const openGames = open ? pf.games.filter(g => g.seriesId === open) : [];

  return (
    <section>
      {header}
      {pf.outcome && (
        <div className="card champion-card">
          {pf.outcome.champions.map(c => (
            <p key={c.group ?? 'fba'}>
              <b>S{state.season} {c.group === null ? 'FBA' : groupLabel(lg, c.group)} Champions: {name(c.teamId)}, {c.score} over {name(c.runnerUp)}</b>
            </p>
          ))}
          {pf.outcome.promotion?.map(p => (
            <p key={p.league} className="muted">
              {groupLabel(lg, p.league)}: {p.promoted.length ? `promoted ${p.promoted.map(name).join(', ')}` : 'no promotion'}
              {' · '}{p.relegated.length ? `relegated ${p.relegated.map(name).join(', ')}` : 'no relegation'}
            </p>
          ))}
          {pf.outcome.champions.map(c => <FinalsMvpCard key={c.group ?? 'fba'} state={state} versions={versions} group={c.group} />)}
          <FinishSeasonCard state={state} versions={versions} />
        </div>
      )}
      {next && nextSeries && (
        <div className="card next-game">
          <span>Playoff game {next.gameNo} · {roundName(lg, nextSeries)}, game {next.gameInSeries} · {abbr(next.away)} at {abbr(next.home)} · {lead}</span>{' '}
          <Link className="btn primary" to={`/league/${lg}/playoffs/game/${next.gameNo}`}>Watch ▸</Link>
        </div>
      )}
      {lg === 'fbad2' && (
        <div className="league-pick" role="group" aria-label="League">
          {pf.seeds.map(s => (
            <button key={s.group} type="button" className={`btn${pick === s.group ? ' primary' : ''}`} onClick={() => { setPick(s.group); setOpen(null); }}>{s.group}</button>
          ))}
        </div>
      )}
      <Bracket league={lg} series={pf.series} teams={teams} season={state.season} group={lg === 'fbad2' ? pick : null} open={open} onOpen={setOpen} />
      {open && (
        <div className="card">
          <h3>{roundName(lg, pf.series.find(s => s.id === open)!)}</h3>
          {openGames.length === 0 && <p className="muted">No games yet.</p>}
          <ul className="series-games">
            {openGames.map(g => (
              <li key={g.gameNo}>
                Game {g.gameInSeries}: {abbr(g.away)} {g.awayPts} @ {abbr(g.home)} {g.homePts}{g.ot ? (g.ot > 1 ? ` (${g.ot}OT)` : ' (OT)') : ''}{' '}
                <Link to={`/league/${lg}/playoffs/game/${g.gameNo}`}>Box score</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pf.seeds.some(s => s.notes.length > 0) && (
        <details>
          <summary>Seeding tiebreaks</summary>
          <ul className="tie-notes">{pf.seeds.flatMap(s => s.notes).map(n => <li key={n} className="muted">{n}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
