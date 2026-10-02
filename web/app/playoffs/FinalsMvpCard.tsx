import { useRef, useState } from 'react';
import { finalsMvpCandidates, pickFinalsMvp } from '../../engine/playoffs/moves';
import { playerName, type SeasonState } from '../../engine/season/state';
import { groupLabel } from '../../engine/shared/leagues';
import { useSaving, type Versions } from '../api';
import { Badge } from '../components/Badge';
import { teamTheme, teamVars } from '../components/teamColors';
import { commitSeason } from '../season/commitSeason';
import './playoffs.css';
import { PlayerName } from '../components/PlayerName';

/** Pick (or change) one champion's Finals MVP (FBA) or Series MVP (D2). After wrap-up it only reports the pick. */
export function FinalsMvpCard({ state, versions, group }: { state: SeasonState; versions: Versions; group: string | null }) {
  const saving = useSaving();
  const started = useRef(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const title = group === null ? 'Finals MVP' : `${groupLabel(state.league, group)} Series MVP`;
  const champion = state.playoffs?.outcome?.champions.find(c => c.group === group);
  const picked = champion?.finalsMvp ?? null;

  const champTeam = champion ? state.teams.teams.find(t => t.teamId === champion.teamId) : undefined;
  const style = champTeam ? teamVars(teamTheme(champTeam, state.league)) : undefined;

  if (state.summary) return picked ? <div className="card headed" style={style}><p>{title}: <PlayerName id={picked} name={playerName(state, picked)} /></p></div> : null;

  const pick = async (playerId: string) => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setProblems([]);
    setSaveError('');
    try {
      const r = pickFinalsMvp(state, group, playerId);
      if (!r.ok) {
        setProblems(r.problems);
        return;
      }
      await commitSeason(r, versions);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      started.current = false;
    }
  };

  const rows = finalsMvpCandidates(state, group);
  return (
    <div className="card headed finals-mvp" style={style}>
      <div className="card-head"><h3>{title}</h3></div>
      <div className="table-wrap">
        <table className="stat-table" aria-label={title}>
          <thead><tr><th>Player</th><th className="n">GP</th><th className="n">PPG</th><th /></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.playerId}>
                <td><PlayerName id={c.playerId} name={c.name} /></td>
                <td className="n">{c.gp}</td>
                <td className="n">{c.ppg.toFixed(1)}</td>
                <td>{c.playerId === picked ? <Badge kind="finals-mvp">{title === 'Finals MVP' ? 'Finals MVP' : 'Series MVP'}</Badge> : <button className="btn" disabled={saving} onClick={() => pick(c.playerId)}>Pick</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problems.length > 0 && <p className="error">{problems.join('; ')}</p>}
      {saveError && <p className="error">Save failed: {saveError}</p>}
    </div>
  );
}
