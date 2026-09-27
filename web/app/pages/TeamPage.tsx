import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { releasePlayer } from '../../engine/roster/moves';
import { isExpired, payroll } from '../../engine/roster/rules';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, PlayersFile, RosterEntry, RostersFile, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { EditDialog } from '../components/EditDialog';
import { PayrollBar } from '../components/PayrollBar';
import { RosterTable } from '../components/RosterTable';
import { teamRating } from '../components/rosterColumns';
import { SignPanel } from '../components/SignPanel';
import { TeamMark } from '../components/TeamMark';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import './league.css';
import './roster.css';

export function TeamPage() {
  const { league = '', teamId = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const { data: players } = useDoc<PlayersFile>(valid ? 'players.json' : null);
  const season = valid && meta ? meta.rosterSeason[league] : undefined;
  const { data: rosters } = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);
  const editable = (league === 'fba' || league === 'fbad2') && meta !== undefined && season === meta.currentSeason && rosters?.locked === false;
  const { state } = useRosterState();
  const { data: fbaTeams } = useDoc<TeamsFile>(editable ? 'leagues/fba/teams.json' : null);
  const [pending, setPending] = useState<{ playerId: string; kind: 'released' | 'cut' } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [resigning, setResigning] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (!teams || !players || !rosters || season === undefined) return <p className="muted">Loading…</p>;
  const team = teams.teams.find(t => t.teamId === teamId);
  if (!team) return <p className="error">No team "{teamId}" in {LEAGUE_LABEL[league]}.</p>;
  const entries = rosters.teams[team.teamId] ?? [];
  const lg = league === 'fbad2' ? 'fbad2' : 'fba';

  const release = async (playerId: string, kind: 'released' | 'cut') => {
    if (!state) return;
    setError('');
    const result = releasePlayer(state, { league: lg, teamId, playerId, kind }, { batchId: newBatchId() });
    if (!result.ok) return setError(result.problems.join('; '));
    try {
      await commitMove(result);
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const actions = (e: RosterEntry) => {
    if (!e.playerId || !state) return null;
    const tags = [];
    if (e.restricted) tags.push(<span key="r" className="tag tag-restricted">Restricted</span>);
    if (lg === 'fba' && isExpired(e, state.season)) tags.push(<span key="x" className="tag tag-expired">Expired</span>);
    if (pending?.playerId === e.playerId) {
      const verb = pending.kind === 'cut' ? 'cut' : 'release';
      return (
        <span className="row-actions">
          <button className="btn primary" onClick={() => release(e.playerId!, pending.kind)}>Confirm {verb}</button>
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
        </span>
      );
    }
    return (
      <span className="row-actions">
        {tags}
        {lg === 'fba' && isExpired(e, state.season) && !state.freeAgents.locked && <button className="btn" onClick={() => setResigning(e.playerId)}>Re-sign</button>}
        <button className="btn" onClick={() => setPending({ playerId: e.playerId!, kind: 'released' })}>Release</button>
        <button className="btn" onClick={() => setPending({ playerId: e.playerId!, kind: 'cut' })}>Cut</button>
        <button className="btn" onClick={() => setEditing(e.playerId)}>Edit</button>
      </span>
    );
  };

  return (
    <section>
      <p><Link to={`/league/${league}`} className="muted">← {LEAGUE_LABEL[league]}</Link></p>
      <div className="team-hero">
        <TeamMark team={team} season={season} size={72} />
        <div>
          <h1>{team.name}</h1>
          <div className="muted">{groupLabel(league, team.group)} · S{season} · Team rating {teamRating(entries) ?? '—'}</div>
          {editable && <Link className="btn" to={`/trade/${league}?team=${teamId}`}>Trade…</Link>}
        </div>
      </div>
      {lg === 'fba' && editable && <PayrollBar total={payroll(entries, season)} />}
      {error && <p className="error">{error}</p>}
      {editing && state && <EditDialog key={editing} state={state} league={lg} teamId={teamId} playerId={editing} onClose={() => setEditing(null)} />}
      {resigning && state && fbaTeams && <SignPanel key={resigning} state={state} teams={fbaTeams} playerId={resigning} defaultTeam={teamId} onClose={() => setResigning(null)} />}
      <div className="table-wrap">
        <RosterTable league={league} entries={entries} players={players.players} extraLabel={editable ? 'Actions' : undefined} renderExtra={editable && state ? actions : undefined} />
      </div>
    </section>
  );
}
