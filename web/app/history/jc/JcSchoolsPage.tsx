import { Link } from 'react-router-dom';
import { jcSchoolCase } from '../../../engine/history/jc';
import { groupLabel } from '../../../engine/shared/leagues';
import type { Team } from '../../../engine/shared/types';
import { useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { TeamName } from '../../components/TeamName';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { useJcSchoolHistory, useJcTeams } from './useJc';

export function JcSchoolsPage() {
  const { seasons, errors, error } = useHistory('fbajc');
  const { settled, teams } = useJcTeams();
  const sh = useJcSchoolHistory();
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons || !settled || !sh.settled) return <p className="muted">Loading…</p>;
  const byConf = new Map<string, Team[]>();
  for (const t of teams) byConf.set(t.group ?? '', [...(byConf.get(t.group ?? '') ?? []), t]);
  const confs = [...byConf.keys()].sort((a, b) => groupLabel('fbajc', a).localeCompare(groupLabel('fbajc', b)));
  const lastSeason = seasons.reduce((m, s) => Math.max(m, s.season), 0);
  const docOf = (id: string) => sh.file?.schools.find(s => s.teamId === id) ?? null;
  return (
    <section className="stack">
      <PageHeader kicker="FBAJC history" title="College Schools" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      {teams.length === 0 && <p className="muted">No schools found.</p>}
      {confs.map(c => (
        <div key={c}>
          <h2 className="section-title">{groupLabel('fbajc', c || null)}</h2>
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>School</th><th className="n">National titles</th><th className="n">NIT titles</th><th className="n">Conference titles</th><th className="n">March Madness</th></tr></thead>
              <tbody>
                {byConf.get(c)!.map(t => {
                  const doc = docOf(t.teamId);
                  const k = jcSchoolCase(t, seasons, doc);
                  return (
                    <tr key={t.teamId}>
                      <td><TeamName team={t} season={lastSeason} size={20} to={`/history/fbajc/schools/${t.teamId}`} /></td>
                      <td className="n">{k.national.length}</td>
                      <td className="n">{k.nit.length}</td>
                      <td className="n">{k.rsTitles.length + k.tournamentTitles.length}</td>
                      <td className="n">{k.mm.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!sh.file && teams.length > 0 && <p className="muted">The imported school history isn't loaded, so March Madness runs and older conference titles are not counted.</p>}
      <p><Link to="/history/fbajc">Back to college history</Link></p>
    </section>
  );
}
