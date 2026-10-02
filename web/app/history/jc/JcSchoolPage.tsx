import { Link, useParams } from 'react-router-dom';
import { jcSchoolCase, jcSeasonLabel, type MmRound } from '../../../engine/history/jc';
import { NATIONAL_LABEL } from '../../../engine/jc/awards';
import { groupLabel } from '../../../engine/shared/leagues';
import type { PlayersFile } from '../../../engine/shared/types';
import { useDoc, useHistory } from '../../api';
import { Hero } from '../../components/Hero';
import { TeamMark } from '../../components/TeamMark';
import { teamTheme } from '../../components/teamColors';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { JcPerson, useJcSchoolHistory, useJcTeams } from './useJc';

const ROUND_LABEL: Record<MmRound, string> = { app: 'Appearance', sweet16: 'Sweet 16', elite8: 'Elite 8', final4: 'Final Four', titleGame: 'Title game', champion: 'Champion' };

const SeasonLinks = ({ list }: { list: number[] }) => (
  list.length === 0 ? <>—</> : <>{list.map((n, i) => <span key={n}>{i > 0 && ', '}<Link to={`/history/fbajc/season/${n}`}>{jcSeasonLabel(n)}</Link></span>)}</>
);

export function JcSchoolPage() {
  const { teamId = '' } = useParams();
  const { seasons, errors, error } = useHistory('fbajc');
  const players = useDoc<PlayersFile>('players.json');
  const { settled, teams } = useJcTeams();
  const sh = useJcSchoolHistory();
  const failure = error ?? players.error;
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled || !sh.settled) return <p className="muted">Loading…</p>;
  const team = teams.find(t => t.teamId === teamId);
  if (!team) return <p className="muted">Not found</p>;
  const doc = sh.file?.schools.find(s => s.teamId === team.teamId) ?? null;
  const k = jcSchoolCase(team, seasons, doc);
  const lastSeason = seasons.reduce((m, s) => Math.max(m, s.season), 0);
  const conf = (c: string | null) => (c ? ` (${groupLabel('fbajc', c)})` : '');
  const titleSeason = (list: { season: number; conf: string | null }[]) => (
    list.length === 0 ? <>—</> : <>{list.map((t, i) => <span key={`${t.season}-${i}`}>{i > 0 && ', '}<Link to={`/history/fbajc/season/${t.season}`}>{jcSeasonLabel(t.season)}</Link>{conf(t.conf)}</span>)}</>
  );
  const awardRows = [
    ...k.awards.national.map(a => ({ ...a, label: NATIONAL_LABEL[a.award as keyof typeof NATIONAL_LABEL] ?? a.award })),
    ...k.awards.conference.map(a => ({ ...a, label: `${groupLabel('fbajc', a.conf)} player of the year` })),
    ...k.awards.allAmerican.map(a => ({ ...a, label: `All-American team ${a.team} (${a.slot})` })),
  ].sort((a, b) => a.season - b.season);
  return (
    <section className="stack">
      <Hero
        kicker={team.group ? groupLabel('fbajc', team.group) : 'College'}
        title={team.name}
        theme={teamTheme(team, 'fbajc')}
        logo={<TeamMark team={team} season={lastSeason} size={72} />}
        stats={[
          { label: 'National titles', value: k.national.length },
          { label: 'Runner-up', value: k.runnerUp.length },
          { label: 'NIT titles', value: k.nit.length },
          { label: 'March Madness', value: k.mm.length },
        ]}
      />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      {!doc && <p className="muted">The imported school history has no entry for this school, so March Madness runs and older conference titles come from the season records only.</p>}
      <div>
        <h2 className="section-title">Titles</h2>
        <ul className="plain-list">
          <li><b>National champion:</b> <SeasonLinks list={k.national} /></li>
          <li><b>National runner-up:</b> <SeasonLinks list={k.runnerUp} /></li>
          <li><b>NIT champion:</b> <SeasonLinks list={k.nit} /></li>
          <li><b>NIT runner-up:</b> <SeasonLinks list={k.nitRunnerUp} /></li>
          <li><b>Conference regular season:</b> {titleSeason(k.rsTitles)}</li>
          <li><b>Conference tournament:</b> {titleSeason(k.tournamentTitles)}</li>
          <li><b>Preseason tournaments:</b> {k.preseason.length === 0 ? '—' : k.preseason.map((p, i) => <span key={i}>{i > 0 && ', '}<Link to={`/history/fbajc/season/${p.season}`}>{jcSeasonLabel(p.season)}</Link> {p.event}</span>)}</li>
        </ul>
      </div>
      <div>
        <h2 className="section-title">March Madness</h2>
        {k.mm.length === 0 ? <p className="muted">No March Madness appearances recorded.</p> : (
          <div className="table-wrap">
            <table className="stat-table">
              <thead><tr><th>Season</th><th>Reached</th></tr></thead>
              <tbody>
                {k.mm.map(r => (
                  <tr key={r.season}>
                    <td><Link to={`/history/fbajc/season/${r.season}`}>{jcSeasonLabel(r.season)}</Link></td>
                    <td>{ROUND_LABEL[r.round]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {awardRows.length > 0 && (
        <div>
          <h2 className="section-title">Awards won by its players</h2>
          <ul className="plain-list">
            {awardRows.map((a, i) => (
              <li key={i}><Link to={`/history/fbajc/season/${a.season}`}>{jcSeasonLabel(a.season)}</Link> {a.label}: <JcPerson id={a.playerId} name={a.name} players={players.data!} /></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
