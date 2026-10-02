import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { awardProblems, lockAwards, setAllFbaSlot, setAward, startAwards } from '../../engine/awards/awardMoves';
import { ALL_FBA_SLOTS, races, SLOT_POSITIONS, type Race, type RaceRow } from '../../engine/awards/races';
import { leagueStepProblem } from '../../engine/season/moves';
import { blockingPause, PAUSE_LABEL, playerName, seasonDocPath, seasonOver, type SeasonResult } from '../../engine/season/state';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { AwardsFile, RostersFile, Team } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { teamTheme, teamVars } from '../components/teamColors';
import { newBatchId } from '../roster/commit';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { useAutosaveDoc } from '../useAutosaveDoc';
import '../pages/season.css';
import '../playoffs/playoffs.css';
import { PlayerName } from '../components/PlayerName';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function why(race: Race, r: RaceRow): string {
  if (r.defense) return `saved ${r.defense.saved.toFixed(2)}/g · stop rate ${(r.defense.stopRate * 100).toFixed(1)}% · ${r.defense.perGame.toFixed(1)} defended/g`;
  if (r.mip) return `${r.mip.lastRating} → ${r.rating} (${signed(r.mip.boost)}) · score ${r.score.toFixed(1)}${r.mip.secondSeason ? ' · 2nd season' : ''}`;
  return `score ${r.score.toFixed(2)} = ${r.parts.ppg.toFixed(2)} PPG + ${r.parts.rating.toFixed(2)} rtg + ${r.parts.win.toFixed(2)} win%`;
}

/** American odds ("+250", "-120") as an implied percentage; null when there are none. */
function impliedPct(odds: string): number | null {
  const n = Number(odds);
  if (!odds || Number.isNaN(n) || n === 0) return null;
  return n > 0 ? (100 / (n + 100)) * 100 : (-n / (-n + 100)) * 100;
}

interface RaceCardProps {
  race: Race;
  name: (id: string) => string;
  teams: Map<string, Team>;
  season: number;
  league: 'fba' | 'fbad2';
  /** The locked winner of this award, when the awards are locked. */
  winnerId?: string;
}

function RaceCard({ race, name, teams, season, league, winnerId }: RaceCardProps) {
  const top = race.rows.slice(0, 10);
  const lead = top.find(r => r.playerId === winnerId) ?? top[0];
  const leadTeam = lead ? teams.get(lead.teamId) : undefined;
  const teamCell = (id: string) => {
    const t = teams.get(id);
    return t ? <TeamName team={t} season={season} variant="abbr" size={18} /> : id;
  };
  return (
    <div className="card headed race-card" style={leadTeam ? teamVars(teamTheme(leadTeam, league)) : undefined}>
      <div className="card-head"><h3>{race.label}</h3></div>
      {!lead ? <p className="muted">No eligible players yet.</p> : (
        <>
          <div className="spotlight">
            <span className="who"><PlayerName id={lead.playerId} name={name(lead.playerId)} /></span>
            <span className="badges">
              {teamCell(lead.teamId)}
              {winnerId && lead.playerId === winnerId && <Badge kind="mvp">Winner</Badge>}
            </span>
            <span className="stat">{lead.position} · {lead.ppg.toFixed(1)} PPG · {lead.rating} rtg{lead.odds ? ` · ${lead.odds}` : ''}</span>
          </div>
          <div className="table-wrap">
            <table className="stat-table race-table">
              <thead><tr><th className="rank">#</th><th>Player</th><th>Team</th><th>Pos</th><th className="n">PPG</th><th className="n">Rtg</th><th>Odds</th></tr></thead>
              <tbody>
                {top.map((r, i) => {
                  const pct = impliedPct(r.odds);
                  return (
                    <tr key={r.playerId}>
                      <td className="rank">{i + 1}</td>
                      <td><PlayerName id={r.playerId} name={name(r.playerId)} />{winnerId === r.playerId && <> <Badge kind="mvp">Winner</Badge></>}<div className="muted why">{why(race, r)}</div></td>
                      <td>{teamCell(r.teamId)}</td><td>{r.position}</td>
                      <td className="n">{r.ppg.toFixed(1)}</td><td className="n">{r.rating}</td>
                      <td className="odds-cell">
                        {r.odds}
                        {pct !== null && <div className="odds-bar" aria-hidden="true"><div style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} /></div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
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
  const header = <PageHeader title={`${LEAGUE_LABEL[lg]} awards · S${state.season}`} />;
  if (!state.schedule || !state.results) return <section className="stack">{header}<p className="muted">No schedule yet.</p></section>;

  const lastSeason = last.data ?? null;
  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const name = (id: string) => playerName(state, id);
  const abbr = (id: string) => teams.get(id)?.abbr ?? id;
  const teamOf = (id: string | null | undefined) => {
    const t = id ? teams.get(id) : undefined;
    return t ? <TeamName team={t} season={state.season} variant="abbr" size={18} /> : id ?? '';
  };
  const doc = autosave.doc ?? state.awards ?? undefined;
  const view = doc ? { ...state, awards: doc } : state;
  const rs = races(view, lastSeason);
  const cards = (winners?: AwardsFile['awards']) => (
    <div className="race-grid">
      {rs.map(r => (
        <RaceCard key={r.award} race={r} name={name} teams={teams} season={state.season} league={lg} winnerId={winners?.find(a => a.award === r.award)?.playerId} />
      ))}
    </div>
  );
  const leagueName = lg === 'fba' ? 'FBA' : 'D2';
  // Without last season's FBA roster every restricted player looks like a rookie and MIP has no candidates.
  const lastMissing = lg === 'fba' && !last.data;
  const lastWarning = lastMissing && (
    <p className="error">Last season's FBA roster ({lastPath}) couldn't be loaded, so ROTY and MIP can't be decided.</p>
  );

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
      <div className="stack">
        <h2>All-FBA teams</h2>
        <div className="grid-2">
          {(['team1', 'team2'] as const).map(team => (
            <div key={team} className="card headed">
              <div className="card-head">
                <h3>{team === 'team1' ? '1st team' : '2nd team'}</h3>
                {!editable && <Badge kind="all-fba">All-FBA</Badge>}
              </div>
              <div className="table-wrap">
                <table className="stat-table all-fba">
                  <thead><tr><th>Slot</th><th>Player</th></tr></thead>
                  <tbody>
                    {ALL_FBA_SLOTS.map((slot, i) => {
                      const slotName = slot === 'ANY' ? `ANY ${i - 2}` : slot;
                      const s = d.allFba![team][i];
                      if (!editable) {
                        return (
                          <tr key={i}>
                            <td>{slotName}</td>
                            <td>{s.playerId ? <span className="all-fba-slot">{name(s.playerId)} {teamOf(s.teamId)}</span> : '—'}</td>
                          </tr>
                        );
                      }
                      const options = (mvp?.rows ?? []).filter(x => SLOT_POSITIONS[slot].includes(x.position));
                      return (
                        <tr key={i}>
                          <td>{slotName}</td>
                          <td>
                            <select aria-label={`All-FBA ${team === 'team1' ? '1st' : '2nd'} team ${slotName}`} value={s.playerId ?? ''}
                              onChange={e => {
                                const r = options.find(x => x.playerId === e.target.value);
                                if (r) autosave.update(cur => setAllFbaSlot(cur, team, i, r.playerId, r.teamId));
                              }}>
                              <option value="" disabled>—</option>
                              {options.map(x => <option key={x.playerId} value={x.playerId}>{name(x.playerId)} ({abbr(x.teamId)}) · {x.position}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (doc?.locked) {
    return (
      <section className="stack">
        {header}
        <div className="card headed">
          <div className="card-head"><h3>S{state.season} {leagueName} award winners</h3></div>
          <ul className="winner-list">
            {doc.awards.map(a => (
              <li key={a.award}>
                <Badge kind="mvp">{rs.find(r => r.award === a.award)?.label ?? a.award}</Badge>
                <span>{name(a.playerId)}</span> {teamOf(a.teamId)}
              </li>
            ))}
          </ul>
        </div>
        {allFbaTable(doc, false)}
        <h2>Final races</h2>
        {cards(doc.awards)}
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
      <section className="stack">
        {header}
        {note && <p className="muted">{note}</p>}
        {ready && lastWarning}
        {ready && <div><button className="btn primary" disabled={saving || lastMissing} onClick={() => run(startAwards(state, lastSeason))}>Start awards</button></div>}
        {message && <p className="error">{message}</p>}
        {cards()}
      </section>
    );
  }

  const problems = awardProblems(view, lastSeason, doc);
  return (
    <section className="stack">
      {header}
      {lastWarning}
      <p className="muted">Pick each winner (the race leader is suggested), then lock the awards. Picks save as you go.</p>
      <div className="card headed">
        <div className="card-head"><h3>Winners</h3></div>
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
                  {pick && !r.rows.some(x => x.playerId === pick.playerId) && (
                    <option value={pick.playerId}>{name(pick.playerId)} (not eligible)</option>
                  )}
                  {r.rows.map((x, i) => <option key={x.playerId} value={x.playerId}>{i + 1}. {name(x.playerId)} ({abbr(x.teamId)})</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </div>
      {allFbaTable(doc, true)}
      {problems.length > 0 && <ul className="problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      <div><button className="btn primary" disabled={saving || lastMissing || problems.length > 0} onClick={() => run(lockAwards(view, lastSeason, { batchId: newBatchId() }))}>Lock awards</button></div>
      {autosave.error && <p className="error">{autosave.error}</p>}
      {message && <p className="error">{message}</p>}
      <h2>Races</h2>
      {cards()}
    </section>
  );
}
