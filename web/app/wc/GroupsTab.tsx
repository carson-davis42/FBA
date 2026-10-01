import { Link } from 'react-router-dom';
import type { Team, WorldCupFile } from '../../engine/shared/types';
import { groupClinch } from '../../engine/wc/clinch';
import { groupTable } from '../../engine/wc/worldcup';
import { ClinchLegend, RankCell } from '../components/Clinch';
import { TeamName } from '../components/TeamName';

export function GroupsTab({ wc, byId, season, nextGameNo = null }: { wc: WorldCupFile; byId: Map<string, Team>; season: number; nextGameNo?: number | null }) {
  const label = (id: string) => byId.get(id)?.name ?? id;
  const clinches = Object.fromEntries(Object.keys(wc.groups).map(g => [g, groupClinch(wc, g)]));
  const kinds = Object.values(clinches).flatMap(c => Object.values(c));
  return (
    <div>
      <div className="card-grid">
        {Object.keys(wc.groups).sort().map(g => {
          const table = groupTable(wc, g);
          const clinch = clinches[g];
          const hosted = wc.groups[g].includes(wc.host);
          const games = wc.schedule.filter(s => wc.groups[g].includes(s.home) && wc.groups[g].includes(s.away));
          return (
            <section key={g} className={`card wc-group${hosted ? ' wc-host-group' : ''}`} aria-label={`Group ${g}`}>
              <h3>Group {g}{hosted && <span className="wc-host-tag"> Host</span>}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Team</th><th>W-L</th><th>PF-PA</th></tr></thead>
                  <tbody>
                    {table.rows.map((r, i) => {
                      const t = byId.get(r.teamId);
                      return (
                        <tr key={r.teamId}>
                          <RankCell kind={clinch[r.teamId] ?? null} league="fbawc">{i + 1}</RankCell>
                          <td>{t ? <TeamName team={t} season={season} to={`/league/fbawc/team/${r.teamId}`} /> : r.teamId}</td>
                          <td>{r.w}-{r.l}</td>
                          <td>{r.pf}-{r.pa}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ol className="wc-games">
                {games.map(s => {
                  const r = wc.groupGames[s.gameNo - 1];
                  return (
                    <li key={s.gameNo} className={r ? undefined : 'wc-unplayed'}>
                      {`G${s.gameNo} ${label(s.home)} ${r ? `${r.homePts}–${r.awayPts}` : 'vs'} ${label(s.away)}`}
                      {r && <>{' '}<Link to={`/league/fbawc/game/${s.gameNo}`}>Box score</Link></>}
                      {!r && s.gameNo === nextGameNo && <>{' '}<Link to={`/league/fbawc/game/${s.gameNo}`}>Watch</Link></>}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
      <ClinchLegend kinds={kinds} league="fbawc" />
    </div>
  );
}
