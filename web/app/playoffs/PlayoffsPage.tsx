import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roundName } from '../../engine/playoffs/bracket';
import { lockSeeds, nextPlayoffGame, seasonStandings, seedPreview } from '../../engine/playoffs/moves';
import { leagueStepProblem } from '../../engine/season/moves';
import type { SeasonLeague } from '../../engine/season/schedule';
import { blockingPause, PAUSE_LABEL, playerName, seasonOver, type SeasonState } from '../../engine/season/state';
import { groupLabel, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { PlayoffsFile, Team } from '../../engine/shared/types';
import { useSaving } from '../api';
import { Badge } from '../components/Badge';
import { Hero } from '../components/Hero';
import { PageHeader } from '../components/PageHeader';
import { TeamMark } from '../components/TeamMark';
import { TeamName } from '../components/TeamName';
import { teamTheme } from '../components/teamColors';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { Bracket } from './Bracket';
import { FinalsMvpCard } from './FinalsMvpCard';
import { FinishSeasonCard } from './FinishSeasonCard';
import '../pages/season.css';
import './playoffs.css';

function SeedTables({ lg, state, seeds, teams }: { lg: SeasonLeague; state: SeasonState; seeds: PlayoffsFile['seeds']; teams: Map<string, Team> }) {
  const st = seasonStandings(state);
  return (
    <div className="grid-2">
      {seeds.map(s => {
        const rows = new Map(st.groups.find(g => g.group === s.group)?.rows.map(r => [r.teamId, r]) ?? []);
        return (
          <div key={s.group} className="card headed">
            <div className="card-head"><h3>{groupLabel(lg, s.group)}</h3></div>
            <div className="table-wrap">
              <table className="stat-table seed-table">
                <thead><tr><th className="rank">#</th><th>Team</th><th className="n">Record</th></tr></thead>
                <tbody>
                  {s.teams.map((id, i) => {
                    const t = teams.get(id);
                    const r = rows.get(id);
                    return (
                      <tr key={id}>
                        <td className="rank">{i + 1}</td>
                        <td>{t ? <TeamName team={t} season={state.season} size={20} /> : id}</td>
                        <td className="n rec">{r ? `${r.w}-${r.l}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
  const header = <PageHeader title={`${LEAGUE_LABEL[lg]} playoffs · S${state.season}`} />;
  if (!state.schedule || !state.results) {
    return <section className="stack">{header}<p className="muted">No schedule yet. <Link to="/schedules">Make schedules ▸</Link></p></section>;
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
      <section className="stack">
        {header}
        {!over && <p className="muted">Playoffs start after game {state.schedule.games.length}. Projected seeds from the current standings:</p>}
        {pause && (
          <div className="card headed pause-card">
            <h3>Pause after game {pause.afterGame}: {PAUSE_LABEL[pause.kind]}</h3>
            {pause.kind === 'ratings' && <Link className="btn primary" to="/league/fba/ratings-pause">Adjust ratings ▸</Link>}
          </div>
        )}
        {over && !pause && stepProblem && <p className="muted">{stepProblem}</p>}
        <SeedTables lg={lg} state={state} seeds={seedPreview(state)} teams={teams} />
        {over && !pause && !stepProblem && !state.awards?.locked && (
          <div className="card headed pause-card">
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
    <section className="stack">
      {header}
      {pf.outcome && (
        <>
          {pf.outcome.champions.map(c => {
            const team = teams.get(c.teamId);
            const mvp = c.finalsMvp ? playerName(state, c.finalsMvp) : null;
            return (
              <Hero
                key={c.group ?? 'fba'}
                kicker={c.group === null ? `S${state.season} Champions` : `S${state.season} ${groupLabel(lg, c.group)} Champions`}
                title={name(c.teamId)}
                level="h2"
                logo={team ? <TeamMark team={team} season={state.season} size={96} /> : undefined}
                theme={team ? teamTheme(team, lg) : undefined}
              >
                <span className="champ-line">{c.score} over {name(c.runnerUp)}</span>
                {mvp && <span className="champ-line"><Badge kind="finals-mvp">{c.group === null ? 'Finals MVP' : 'Series MVP'}</Badge><span>{mvp}</span></span>}
              </Hero>
            );
          })}
          {pf.outcome.promotion && (
            <div className="card outcome-notes">
              {pf.outcome.promotion.map(p => (
                <p key={p.league} className="muted">
                  {groupLabel(lg, p.league)}: {p.promoted.length ? `promoted ${p.promoted.map(name).join(', ')}` : 'no promotion'}
                  {' · '}{p.relegated.length ? `relegated ${p.relegated.map(name).join(', ')}` : 'no relegation'}
                </p>
              ))}
            </div>
          )}
          <div className="grid-2">
            {pf.outcome.champions.map(c => <FinalsMvpCard key={c.group ?? 'fba'} state={state} versions={versions} group={c.group} />)}
            <FinishSeasonCard state={state} versions={versions} />
          </div>
        </>
      )}
      {next && nextSeries && (
        <div className="card next-game">
          <span>Playoff game {next.gameNo} · {roundName(lg, nextSeries)}, game {next.gameInSeries} · {abbr(next.away)} at {abbr(next.home)} · {lead}</span>{' '}
          <Link className="btn primary" to={`/league/${lg}/playoffs/game/${next.gameNo}`}>Watch ▸</Link>
        </div>
      )}
      {lg === 'fbad2' && (
        <div className="chips league-pick" role="group" aria-label="League">
          {pf.seeds.map(s => (
            <button key={s.group} type="button" className="chip" aria-pressed={pick === s.group} onClick={() => { setPick(s.group); setOpen(null); }}>{s.group}</button>
          ))}
        </div>
      )}
      <Bracket league={lg} series={pf.series} teams={teams} season={state.season} group={lg === 'fbad2' ? pick : null} open={open} onOpen={setOpen} />
      {open && (
        <div className="card headed">
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
