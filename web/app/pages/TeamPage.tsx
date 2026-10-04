import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { releasePlayer } from '../../engine/roster/moves';
import { isExpired, payroll } from '../../engine/roster/rules';
import { lockProblem } from '../../engine/season/locks';
import { playerSeasonStats } from '../../engine/season/ratingPause';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, PlayersFile, ResultsFile, RosterEntry, RostersFile, ScheduleFile, TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { useWcRosters } from '../wc/useWcRosters';
import { EditDialog } from '../components/EditDialog';
import { ExtendDialog } from '../components/ExtendDialog';
import { PayrollBar } from '../components/PayrollBar';
import { RosterTable } from '../components/RosterTable';
import { teamRating } from '../components/rosterColumns';
import { SignPanel } from '../components/SignPanel';
import { Hero } from '../components/Hero';
import { SubNav } from '../components/SubNav';
import { teamTheme } from '../components/teamColors';
import { TeamMark } from '../components/TeamMark';
import { TeamName } from '../components/TeamName';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import { useSeasonPhase } from '../season/useSeasonPhase';
import './league.css';
import './roster.css';

export function TeamPage() {
  const { league = '', teamId = '' } = useParams();
  const valid = isLeagueId(league);
  const isWc = league === 'fbawc';
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const { data: players } = useDoc<PlayersFile>(valid ? 'players.json' : null);
  const wc = useWcRosters(isWc);
  const season = valid && meta ? (isWc ? wc.season : meta.rosterSeason[league]) : undefined;
  const { data: plainRosters } = useDoc<RostersFile>(season === undefined || isWc ? null : `leagues/${league}/S${season}/rosters.json`);
  const rosters = isWc ? wc.rosters ?? undefined : plainRosters;
  const seasonal = (league === 'fba' || league === 'fbad2') && season !== undefined;
  const { data: schedule } = useDoc<ScheduleFile>(seasonal ? `leagues/${league}/S${season}/schedule.json` : null);
  const { data: results } = useDoc<ResultsFile>(seasonal ? `leagues/${league}/S${season}/results.json` : null);
  const editable = (league === 'fba' || league === 'fbad2') && meta !== undefined && season === meta.currentSeason && rosters?.locked === false;
  const { state, versions } = useRosterState();
  const phase = useSeasonPhase();
  const { data: fbaTeams } = useDoc<TeamsFile>(editable ? 'leagues/fba/teams.json' : null);
  const [pending, setPending] = useState<{ playerId: string; kind: 'released' | 'cut' } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [extending, setExtending] = useState<string | null>(null);
  const [resigning, setResigning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('roster');
  const saving = useSaving();

  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (isWc && wc.settled && wc.rosters === null) return <p className="muted">No World Cup rosters yet. Start qualifying to generate them.</p>;
  if (!teams || !players || !rosters || season === undefined) return <p className="muted">Loading…</p>;
  const team = teams.teams.find(t => t.teamId === teamId);
  if (!team) return <p className="error">No team "{teamId}" in {LEAGUE_LABEL[league]}.</p>;
  const entries = rosters.teams[team.teamId] ?? [];
  const lg = league === 'fbad2' ? 'fbad2' : 'fba';
  const pStats = playerSeasonStats(results ?? null);
  const ppg = new Map([...pStats].map(([id, s]) => [id, s.games ? s.pts / s.games : 0]));
  const myGames = schedule ? schedule.games.filter(g => g.home === team.teamId || g.away === team.teamId) : [];

  const release = async (playerId: string, kind: 'released' | 'cut') => {
    if (!state) return;
    setError('');
    const result = releasePlayer(state, { league: lg, teamId, playerId, kind }, { batchId: newBatchId(), phase });
    if (!result.ok) return setError(result.problems.join('; '));
    try {
      await commitMove(result, versions);
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const actions = (e: RosterEntry) => {
    if (!e.playerId || !state || phase === undefined) return null;
    const tags = [];
    if (e.restricted) tags.push(<span key="r" className="tag tag-restricted">Restricted</span>);
    if (lg === 'fba' && isExpired(e, state.season)) tags.push(<span key="x" className="tag tag-expired">Expired</span>);
    if (pending?.playerId === e.playerId) {
      const verb = pending.kind === 'cut' ? 'cut' : 'release';
      return (
        <span className="row-actions">
          <button className="btn primary" disabled={saving} onClick={() => release(e.playerId!, pending.kind)}>Confirm {verb}</button>
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
        </span>
      );
    }
    return (
      <span className="row-actions">
        {tags}
        {lg === 'fba' && e.contractEnd != null && e.contractAmount != null && !isExpired(e, state.season) && (
          <button className="btn" onClick={() => { setEditing(null); setResigning(null); setExtending(e.playerId); }}>Extend</button>
        )}
        {lg === 'fba' && isExpired(e, state.season) && !state.freeAgents.locked && !lockProblem(phase, 'fba', 'sign') && (
          <button className="btn" onClick={() => { setExtending(null); setEditing(null); setResigning(e.playerId); }}>Re-sign</button>
        )}
        {!lockProblem(phase, lg, 'release') && (
          <>
            <button className="btn" onClick={() => setPending({ playerId: e.playerId!, kind: 'released' })}>Release</button>
            <button className="btn" onClick={() => setPending({ playerId: e.playerId!, kind: 'cut' })}>Cut</button>
          </>
        )}
        {!lockProblem(phase, lg, 'edit') && <button className="btn" onClick={() => { setExtending(null); setEditing(e.playerId); }}>Edit</button>}
      </span>
    );
  };

  const theme = teamTheme(team, league);
  const teamBy = (id: string) => teams.teams.find(t => t.teamId === id);
  const opponent = (id: string) => { const o = teamBy(id); return o ? <TeamName team={o} season={season} variant="abbr" size={18} to={`/league/${league}/team/${id}`} /> : id; };
  const stats = [
    { label: 'Rating', value: teamRating(entries) ?? '—' },
    { label: 'Players', value: entries.filter(e => e.playerId !== null || (isWc && e.rating !== null)).length },
    ...(lg === 'fba' && editable ? [{ label: 'Payroll', value: `$${payroll(entries, season)}` }] : []),
  ];
  const sections = [{ id: 'roster', label: 'Roster' }, ...(myGames.length > 0 ? [{ id: 'schedule', label: 'Schedule' }] : [])];
  const shown = sections.some(x => x.id === tab) ? tab : 'roster';

  return (
    <section>
      <p><Link to={`/league/${league}`} className="muted">← {LEAGUE_LABEL[league]}</Link></p>
      <Hero
        theme={theme}
        logo={<TeamMark team={team} season={season} size={96} />}
        kicker={`${LEAGUE_LABEL[league]} · ${groupLabel(league, team.group)} · S${season}`}
        title={team.name}
        stats={stats}
      >
        {editable && <Link className="btn" to={`/trade/${league}?team=${teamId}`}>Trade…</Link>}
        {league === 'fba' && <Link className="btn" to={`/history/fba/teams/${teamId}`}>Franchise history</Link>}
        {league === 'fbajc' && <Link className="btn" to={`/history/fbajc/schools/${teamId}`}>School history</Link>}
        {league === 'fbad2' && <Link className="btn" to={`/history/fbad2/teams/${teamId}`}>Team history</Link>}
        {league === 'fbawc' && <Link className="btn" to={`/history/fbawc/teams/${teamId}`}>Team history</Link>}
      </Hero>
      {lg === 'fba' && editable && <PayrollBar total={payroll(entries, season)} />}
      {error && <p className="error">{error}</p>}
      {editing && state && <EditDialog key={editing} state={state} league={lg} teamId={teamId} playerId={editing} onClose={() => setEditing(null)} versions={versions} phase={phase} />}
      {extending && state && <ExtendDialog key={extending} state={state} teamId={teamId} playerId={extending} onClose={() => setExtending(null)} versions={versions} />}
      {resigning && state && fbaTeams && <SignPanel key={resigning} state={state} teams={fbaTeams} playerId={resigning} defaultTeam={teamId} onClose={() => setResigning(null)} versions={versions} phase={phase} />}
      {editable && phase && lockProblem(phase, lg, 'release') && <p className="muted">{lockProblem(phase, lg, 'release')}</p>}
      {sections.length > 1 && <SubNav label="Team sections" items={sections} active={shown} onSelect={setTab} />}
      {shown === 'roster' && (
        <div className="tab-panel" id="panel-roster" role={sections.length > 1 ? 'tabpanel' : undefined} aria-labelledby={sections.length > 1 ? 'tab-roster' : undefined}>
          <div className="table-wrap">
            <RosterTable league={league} entries={entries} players={players.players} ppg={results ? ppg : undefined} extraLabel={editable ? 'Actions' : undefined} renderExtra={editable && state ? actions : undefined} />
          </div>
        </div>
      )}
      {shown === 'schedule' && (
        <div className="tab-panel" id="panel-schedule" role={sections.length > 1 ? 'tabpanel' : undefined} aria-labelledby={sections.length > 1 ? 'tab-schedule' : undefined}>
          <h2 className="section-title">S{season} schedule &amp; results</h2>
          <div className="table-wrap tall">
            <table className="stat-table roster" aria-label="Schedule & results">
              <thead><tr><th>#</th><th>Opponent</th><th>Result</th></tr></thead>
              <tbody>
                {myGames.map(g => {
                  const r = results?.games[g.gameNo - 1];
                  const home = g.home === team.teamId;
                  const mine = r ? (home ? r.homePts : r.awayPts) : 0;
                  const theirs = r ? (home ? r.awayPts : r.homePts) : 0;
                  return (
                    <tr key={g.gameNo}>
                      <td>{g.gameNo}</td>
                      <td>{home ? 'vs ' : '@ '}{opponent(home ? g.away : g.home)}</td>
                      <td>{r ? `${mine > theirs ? 'W' : 'L'} ${mine}-${theirs}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
