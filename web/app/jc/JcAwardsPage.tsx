import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  allAmericanCandidates, awardsComplete, jcRaces, mvpCandidates, pickAllAmerican, pickConference, pickMvp, pickNational,
  racePicksLocked, startAwards, suggestAllAmerican, type JcRace,
} from '../../engine/jc/awards';
import { finishJcSeason, postseasonStage } from '../../engine/jc/postseason';
import type { JcState } from '../../engine/jc/state';
import { calendarProblem } from '../../engine/season/moves';
import { JC_ALL_AMERICAN_SLOTS, type JcNationalAward, type Position } from '../../engine/shared/types';
import { PageHeader } from '../components/PageHeader';
import { jcGate } from './JcGate';
import { usePostseasonDocs } from './usePostseasonDocs';
import './jc.css';
import { PlayerName } from '../components/PlayerName';

const SLOT_POSITIONS: Record<string, Position[]> = { G: ['PG', 'SG'], F: ['SF', 'PF'], C: ['C'], ANY: ['PG', 'SG', 'SF', 'PF', 'C'] };

export function JcAwardsPage() {
  const { season, docs, saving, error, run } = usePostseasonDocs();
  const [open, setOpen] = useState(false);
  const races = useMemo(() => (docs.state?.awards ? jcRaces(docs.state) : []), [docs.state]);
  const afterTournaments = !!docs.state && ['allAmerican', 'mvp', 'finish', 'done'].includes(postseasonStage(docs.state));
  const candidates = useMemo(() => (docs.state && afterTournaments ? allAmericanCandidates(docs.state) : []), [docs.state, afterTournaments]);
  const mvps = useMemo(() => (docs.state && afterTournaments ? { mm: mvpCandidates(docs.state, 'mm'), nit: mvpCandidates(docs.state, 'nit') } : { mm: [], nit: [] }), [docs.state, afterTournaments]);
  const kicker = 'Junior College';
  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Awards" /></section>;
  const gate = jcGate(docs, kicker, 'Awards');
  if (gate) return <>{gate}</>;
  const state = docs.state!;
  const stage = postseasonStage(state);
  const stepProblem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  const abbr = (teamId: string) => state.teams.teams.find(t => t.teamId === teamId)?.abbr ?? teamId;
  const who = (playerId: string | null, teamId: string | null = null): string => {
    if (!playerId) return 'Not picked';
    const tid = teamId ?? Object.entries(state.rosters.teams).find(([, es]) => es.some(e => e.playerId === playerId))?.[0] ?? '';
    return `${state.players.players[playerId]?.name ?? 'X'} (${abbr(tid)})`;
  };
  const awards = state.awards;
  const tournamentsDone = afterTournaments;
  const picksLocked = racePicksLocked(state);
  const finished = stage === 'done';

  const raceBlock = (race: JcRace) => {
    const winner = race.kind === 'national'
      ? awards!.national.find(a => a.award === race.id)?.playerId ?? null
      : awards!.conference.find(a => a.conf === race.id)?.playerId ?? null;
    const pick = (playerId: string | null) => () => void run(() => (race.kind === 'national'
      ? pickNational(state, race.id as JcNationalAward, playerId)
      : pickConference(state, race.id, playerId)));
    return (
      <section key={`${race.kind}-${race.id}`} className="card jc-race" aria-label={race.label}>
        <h3>{race.label}</h3>
        <p>Winner: <strong><PlayerName id={winner} name={who(winner)} /></strong>{winner && !finished && !picksLocked && <>{' '}<button className="btn" disabled={saving} onClick={pick(null)}>Clear</button></>}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Player</th><th>Pos</th><th>PPG</th><th>Rtg</th>{race.id === 'DPOY' && <th>Saved/G</th>}<th>Odds</th><th /></tr></thead>
            <tbody>
              {race.rows.slice(0, race.limit).map((r, i) => (
                <tr key={r.playerId} className={r.playerId === winner ? 'jc-champion' : undefined}>
                  <td>{i + 1}</td>
                  <td><PlayerName id={r.playerId} name={who(r.playerId, r.teamId)} /></td>
                  <td>{r.position}</td>
                  <td>{r.ppg.toFixed(1)}</td>
                  <td>{r.rating}</td>
                  {race.id === 'DPOY' && <td>{r.defense?.saved.toFixed(2)}</td>}
                  <td>{r.odds}</td>
                  <td><button className="btn" disabled={saving || finished || picksLocked || r.playerId === winner} onClick={pick(r.playerId)}>Pick</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={`S${season} FBAJC Awards`} />
      {error && <p className="error">{error}</p>}
      {!awards ? (
        <>
          <p className="muted">Awards are picked after the fields are set and before the NIT starts.</p>
          <div className="jc-actions">
            <button className="btn primary" disabled={saving || !!stepProblem || !state.postseason?.field} onClick={() => void run(() => startAwards(state))}>Start the awards</button>
          </div>
          {!state.postseason?.field && <p className="muted">Set the fields on the <Link to="/league/fbajc/postseason?tab=field">Postseason page</Link> first.</p>}
        </>
      ) : (
        <>
          <p className="muted">{awardsComplete(awards) ? 'Every award has a winner: the NIT can start.' : 'Pick every award before the NIT starts.'} <Link to="/league/fbajc/postseason">Postseason</Link></p>
          <h2>National awards</h2>
          <div className="jc-regions">{races.filter(r => r.kind === 'national').map(raceBlock)}</div>
          <h2>Conference Players of the Year</h2>
          <button className="btn" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the 18 conference races</button>
          {open && <div className="jc-regions">{races.filter(r => r.kind === 'conference').map(raceBlock)}</div>}

          <h2>All-American teams</h2>
          {!tournamentsDone ? <p className="muted">Picked after the NIT and March Madness.</p> : (
            <>
              <div className="jc-actions">
                <button className="btn" disabled={saving || finished} onClick={() => void run(() => suggestAllAmerican(state))}>Suggest all three teams</button>
              </div>
              <div className="jc-regions">
                {([1, 2, 3] as const).map(team => (
                  <div key={team} className="card jc-field">
                    <h3>Team {team}</h3>
                    {JC_ALL_AMERICAN_SLOTS.map((slot, k) => {
                      const current = awards.allAmerican?.find(t => t.team === team)?.slots[k].playerId ?? '';
                      return (
                        <label key={k} className="jc-conf-pick">{slot}{' '}
                          <select aria-label={`Team ${team} ${slot} ${k + 1}`} value={current} disabled={saving || finished}
                            onChange={e => void run(() => pickAllAmerican(state, team, k, e.target.value || null))}>
                            <option value="">Not picked</option>
                            {current && !candidates.some(c => c.playerId === current) && <option value={current}>{who(current)}</option>}
                            {[...candidates.filter(c => c.playerId === current), ...candidates.filter(c => c.playerId !== current && SLOT_POSITIONS[slot].includes(c.position)).slice(0, 80)].map(c => (
                              <option key={c.playerId} value={c.playerId}>{who(c.playerId, c.teamId)} {c.position} {c.ppg.toFixed(1)} ppg{c.tournamentPpg ? ` / ${c.tournamentPpg.toFixed(1)} postseason` : ''}</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}

          <h2>Tournament MVPs</h2>
          {(['mm', 'nit'] as const).map(which => {
            const list = mvps[which];
            const label = which === 'mm' ? 'March Madness' : 'NIT';
            return (
              <label key={which} className="jc-conf-pick">{label} MVP{' '}
                <select aria-label={`${label} MVP`} value={awards.mvp[which] ?? ''} disabled={saving || finished || list.length === 0}
                  onChange={e => void run(() => pickMvp(state, which, e.target.value || null))}>
                  <option value="">{list.length ? 'Not picked' : 'Waiting for the champion'}</option>
                  {list.map(c => <option key={c.playerId} value={c.playerId}>{who(c.playerId)} {c.ppg.toFixed(1)} ppg</option>)}
                </select>
              </label>
            );
          })}

          <h2>Finish the season</h2>
          <FinishBar state={state} saving={saving} run={run} />
        </>
      )}
    </section>
  );
}

function FinishBar({ state, saving, run }: { state: JcState; saving: boolean; run: (b: () => ReturnType<typeof finishJcSeason>) => Promise<void> }) {
  const stage = postseasonStage(state);
  const check = useMemo(() => (stage === 'finish' ? finishJcSeason(state) : null), [state, stage]);
  const why = stage === 'done' ? 'The season is finished.' : check && !check.ok ? check.problems.join(' ') : stage !== 'finish' ? 'Finish the awards, tournaments, All-American teams and MVP picks first.' : null;
  return (
    <div className="jc-actions">
      <button className="btn primary" disabled={saving || !!why} title={why ?? undefined} onClick={() => void run(() => finishJcSeason(state))}>Finish S{state.season} season</button>
      {why && <span className="muted">{why}</span>}
    </div>
  );
}
