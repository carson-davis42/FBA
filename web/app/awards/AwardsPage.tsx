import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { awardProblems, lockAwards, setAllFbaSlot, setAward, startAwards } from '../../engine/awards/awardMoves';
import { ALL_FBA_SLOTS, races, SLOT_POSITIONS, type Race, type RaceRow } from '../../engine/awards/races';
import { leagueStepProblem } from '../../engine/season/moves';
import { blockingPause, PAUSE_LABEL, playerName, seasonDocPath, seasonOver, type SeasonResult } from '../../engine/season/state';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { AwardsFile, RostersFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { newBatchId } from '../roster/commit';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { useAutosaveDoc } from '../useAutosaveDoc';
import '../pages/season.css';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function why(race: Race, r: RaceRow): string {
  if (r.defense) return `saved ${r.defense.saved.toFixed(2)}/g · stop rate ${(r.defense.stopRate * 100).toFixed(1)}% · ${r.defense.perGame.toFixed(1)} defended/g`;
  if (r.mip) return `${r.mip.lastRating} → ${r.rating} (${signed(r.mip.boost)}) · score ${r.score.toFixed(1)}${r.mip.secondSeason ? ' · 2nd season' : ''}`;
  return `score ${r.score.toFixed(2)} = ${r.parts.ppg.toFixed(2)} PPG + ${r.parts.rating.toFixed(2)} rtg + ${r.parts.win.toFixed(2)} win%`;
}

function RaceCard({ race, name, abbr }: { race: Race; name: (id: string) => string; abbr: (id: string) => string }) {
  const top = race.rows.slice(0, 10);
  return (
    <div className="card race-card">
      <h3>{race.label}</h3>
      {top.length === 0 ? <p className="muted">No eligible players yet.</p> : (
        <div className="table-wrap">
          <table className="race-table">
            <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th className="n">PPG</th><th className="n">Rtg</th><th className="n">Odds</th></tr></thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={r.playerId}>
                  <td>{i + 1}</td>
                  <td>{name(r.playerId)}<div className="muted why">{why(race, r)}</div></td>
                  <td>{abbr(r.teamId)}</td><td>{r.position}</td>
                  <td className="n">{r.ppg.toFixed(1)}</td><td className="n">{r.rating}</td><td className="n">{r.odds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AwardsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, versions, error } = useSeasonState(lg);
  const saving = useSaving();
  const lastPath = state && lg === 'fba' ? `leagues/fba/S${state.season - 1}/rosters.json` : null;
  const last = useDoc<RostersFile>(lastPath);
  const path = state && lg ? seasonDocPath('awards', lg, state.season) : '';
  const autosave = useAutosaveDoc<AwardsFile>(path, state?.awards ?? undefined, versions[path] ?? null);
  const [message, setMessage] = useState('');

  if (!lg) return <p className="error">Awards are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state || (lastPath && !last.data && !last.missing && !last.error)) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <h1>{LEAGUE_LABEL[lg]} awards · S{state.season}</h1>
      <LeagueTabs league={lg} />
    </>
  );
  if (!state.schedule || !state.results) return <section>{header}<p className="muted">No schedule yet.</p></section>;

  const lastSeason = last.data ?? null;
  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const name = (id: string) => playerName(state, id);
  const abbr = (id: string) => teams.get(id)?.abbr ?? id;
  const doc = autosave.doc ?? state.awards ?? undefined;
  const view = doc ? { ...state, awards: doc } : state;
  const rs = races(view, lastSeason);
  const cards = <div className="race-grid">{rs.map(r => <RaceCard key={r.award} race={r} name={name} abbr={abbr} />)}</div>;
  const leagueName = lg === 'fba' ? 'FBA' : 'D2';

  const run = async (r: SeasonResult) => {
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    setMessage('');
    try {
      await commitSeason(r, { ...versions, [path]: autosave.version });
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const allFbaTable = (d: AwardsFile, editable: boolean) => {
    if (!d.allFba) return null;
    const mvp = rs.find(r => r.award === 'MVP');
    return (
      <div className="card">
        <h3>All-FBA teams</h3>
        <table className="all-fba">
          <thead><tr><th></th><th>1st team</th><th>2nd team</th></tr></thead>
          <tbody>
            {ALL_FBA_SLOTS.map((slot, i) => {
              const slotName = slot === 'ANY' ? `ANY ${i - 2}` : slot;
              return (
                <tr key={i}>
                  <td>{slotName}</td>
                  {(['team1', 'team2'] as const).map(team => {
                    const s = d.allFba![team][i];
                    if (!editable) return <td key={team}>{s.playerId ? `${name(s.playerId)} (${abbr(s.teamId ?? '')})` : '—'}</td>;
                    const options = (mvp?.rows ?? []).filter(x => SLOT_POSITIONS[slot].includes(x.position));
                    return (
                      <td key={team}>
                        <select aria-label={`All-FBA ${team === 'team1' ? '1st' : '2nd'} team ${slotName}`} value={s.playerId ?? ''}
                          onChange={e => {
                            const r = options.find(x => x.playerId === e.target.value);
                            if (r) autosave.update(cur => setAllFbaSlot(cur, team, i, r.playerId, r.teamId));
                          }}>
                          <option value="" disabled>—</option>
                          {options.map(x => <option key={x.playerId} value={x.playerId}>{name(x.playerId)} ({abbr(x.teamId)}) · {x.position}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (doc?.locked) {
    return (
      <section>
        {header}
        <div className="card">
          <h3>S{state.season} {leagueName} award winners</h3>
          <ul className="award-winners">
            {doc.awards.map(a => <li key={a.award}><b>{rs.find(r => r.award === a.award)?.label ?? a.award}</b>: {name(a.playerId)} ({abbr(a.teamId)})</li>)}
          </ul>
        </div>
        {allFbaTable(doc, false)}
        <h2>Final races</h2>
        {cards}
      </section>
    );
  }

  const over = seasonOver(state);
  const pause = blockingPause(state);
  const stepProblem = leagueStepProblem(state.calendar, lg);
  const ready = over && !pause && !stepProblem;

  if (!doc) {
    const note = !over
      ? `The awards are decided after game ${state.schedule.games.length}. Live races:`
      : pause ? `Finish the ${PAUSE_LABEL[pause.kind]} pause (after game ${pause.afterGame}) first.` : stepProblem;
    return (
      <section>
        {header}
        {note && <p className="muted">{note}</p>}
        {ready && <button className="btn primary" disabled={saving} onClick={() => run(startAwards(state, lastSeason))}>Start awards</button>}
        {message && <p className="error">{message}</p>}
        {cards}
      </section>
    );
  }

  const problems = awardProblems(view, lastSeason, doc);
  return (
    <section>
      {header}
      <p className="muted">Pick each winner (the race leader is suggested), then lock the awards. Picks save as you go.</p>
      <div className="card">
        <h3>Winners</h3>
        <div className="award-picks">
          {rs.filter(r => r.rows.length).map(r => {
            const pick = doc.awards.find(a => a.award === r.award);
            return (
              <label key={r.award}>{r.label}{' '}
                <select aria-label={r.label} value={pick?.playerId ?? ''}
                  onChange={e => {
                    const row = r.rows.find(x => x.playerId === e.target.value);
                    if (row) autosave.update(cur => setAward(cur, r.award, row.playerId, row.teamId));
                  }}>
                  <option value="" disabled>—</option>
                  {r.rows.map((x, i) => <option key={x.playerId} value={x.playerId}>{i + 1}. {name(x.playerId)} ({abbr(x.teamId)})</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </div>
      {allFbaTable(doc, true)}
      {problems.length > 0 && <ul className="problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      <button className="btn primary" disabled={saving || problems.length > 0} onClick={() => run(lockAwards(view, lastSeason, { batchId: newBatchId() }))}>Lock awards</button>
      {autosave.error && <p className="error">{autosave.error}</p>}
      {message && <p className="error">{message}</p>}
      <h2>Races</h2>
      {cards}
    </section>
  );
}
