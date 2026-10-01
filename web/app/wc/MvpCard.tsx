import { useState } from 'react';
import type { PlayersFile, SummaryFile, Team, WorldCupFile } from '../../engine/shared/types';
import { tournamentMvpCandidates, type MvpNames } from '../../engine/wc/mvp';
import { finishWorldCupWithMvp } from '../../engine/wc/summary';
import type { WorldCupState } from '../../engine/wc/worldcup';
import { Badge } from '../components/Badge';
import { TeamName } from '../components/TeamName';
import { PlayerLink } from '../history/PlayerLink';
import type { WcFail, WcOkOrWrites } from './useWcRun';

/** Pick the tournament MVP and finish the World Cup. After finishing it only reports the result. */
export function MvpCard({ wc, state, players, byId, season, summary, blocked, run }: {
  wc: WorldCupFile;
  state: WorldCupState | null;
  players: PlayersFile | null;
  byId: Map<string, Team>;
  season: number;
  summary: SummaryFile | null;
  blocked: boolean;
  run: (build: () => WcOkOrWrites | WcFail) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const names: MvpNames = {
    player: id => players?.players[id]?.name ?? id,
    team: id => byId.get(id)?.name ?? id,
  };
  const pf = players ?? { nextId: 1, players: {} };

  const done = summary?.champions.find(c => c.title === 'World Cup Champion');
  if (done) {
    const mvp = done.finalsMvp ? names.player(done.finalsMvp) : done.mvpName ?? 'none';
    return <div className="card wc-mvp-done"><p>World Cup finished: {done.champion}, MVP {mvp}</p></div>;
  }

  const rows = tournamentMvpCandidates(wc, names);
  const finish = (): WcOkOrWrites | WcFail => (state && picked ? finishWorldCupWithMvp(state, picked, names, summary) : { ok: false, problems: ['Pick an MVP first'] });
  return (
    <div className="card wc-mvp">
      <h3>Tournament MVP</h3>
      <div className="table-wrap tall">
        <table className="stat-table" aria-label="Tournament MVP">
          <thead><tr><th>Player</th><th>Team</th><th className="n">GP</th><th className="n">PPG</th><th /></tr></thead>
          <tbody>
            {rows.map(c => {
              const team = byId.get(c.teamId);
              return (
                <tr key={c.key}>
                  <td>
                    {c.generated
                      ? <>{c.name.replace(/ \(Generated\)$/, '')} <Badge kind="current">Generated</Badge></>
                      : <PlayerLink id={c.key} players={pf} />}
                  </td>
                  <td>{team ? <TeamName team={team} season={season} variant="abbr" size={16} /> : c.teamId}</td>
                  <td className="n">{c.gp}</td>
                  <td className="n">{c.ppg.toFixed(1)}</td>
                  <td>{c.key === picked ? <Badge kind="mvp">MVP</Badge> : <button className="btn" onClick={() => setPicked(c.key)}>Pick</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="wc-actions">
        <button className="btn primary" disabled={blocked || picked === null} onClick={() => void run(finish)}>Finish World Cup</button>
      </div>
    </div>
  );
}
