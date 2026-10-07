import { Link, useParams } from 'react-router-dom';
import { AWARD_LABEL } from '../../../engine/awards/races';
import { d2TeamCase, leaguePath } from '../../../engine/history/d2';
import { groupLabel } from '../../../engine/shared/leagues';
import type { D2DraftHistoryFile, D2LeagueHistoryFile, MetaFile, PlayersFile } from '../../../engine/shared/types';
import { docFailure, docSettled, useDoc, useHistory } from '../../api';
import { Hero } from '../../components/Hero';
import { teamTheme } from '../../components/teamColors';
import { TeamMark } from '../../components/TeamMark';
import { PlayerLink } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';
import { useD2Teams } from './useD2';

const finalOf = (title: string) => title.replace(/^(.*) Champion( \(.+\))?$/, '$1 final$2');

export function D2TeamPage() {
  const { teamId = '' } = useParams();
  const { seasons, error } = useHistory('fbad2');
  const players = useDoc<PlayersFile>('players.json');
  const history = useDoc<D2LeagueHistoryFile>('leagues/fbad2/leagueHistory.json');
  const drafts = useDoc<D2DraftHistoryFile>('leagues/fbad2/draftHistory.json');
  const meta = useDoc<MetaFile>('meta.json');
  const { settled, teams } = useD2Teams();
  const failure = error ?? players.error ?? docFailure(history) ?? docFailure(drafts) ?? docFailure(meta);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled || !docSettled(history) || !docSettled(drafts) || !docSettled(meta)) return <p className="muted">Loading…</p>;
  const team = teams.find(t => t.teamId === teamId);
  if (!team) return <p className="muted">Not found</p>;
  const roster = players.data;
  const currentSeason = meta.data?.currentSeason ?? 79;
  const c = d2TeamCase(team, seasons, drafts.data ?? null);
  const path = leaguePath(history.data ?? null, seasons, teamId, team.group ? { season: currentSeason, group: team.group } : undefined);
  const span = (p: { from: number; to: number | null }) => (p.to === p.from ? `S${p.from}` : `S${p.from}–${p.to === null ? 'pres.' : `S${p.to}`}`);
  return (
    <section className="stack">
      <Hero
        kicker={groupLabel('fbad2', team.group)}
        title={team.name}
        theme={teamTheme(team, 'fbad2')}
        logo={<TeamMark team={team} season={currentSeason} size={72} />}
        stats={[
          { label: 'Titles', value: c.titles.length },
          { label: 'Finals', value: c.titles.length + c.finalsLost.length },
          { label: 'RS titles', value: c.rsTitles.length },
        ]}
      >
        {team.city && <p className="hero-place">{team.country ? `${team.city}, ${team.country}` : team.city}</p>}
      </Hero>
      <HistoryLeagueSwitch />
      <div>
        <h2 className="section-title">League path</h2>
        {!history.data && <p className="muted">No D2 league history yet. Run npm run import -- --d2-history --data data.</p>}
        {path.length > 0 && (
          <ul className="chips">
            {path.map((p, i) => <li key={i} className="chip">{groupLabel('fbad2', p.group)} {span(p)}</li>)}
          </ul>
        )}
      </div>
      {c.titles.length > 0 && (
        <div>
          <h2 className="section-title">Titles</h2>
          <ul className="plain-list">
            {c.titles.map((t, i) => <li key={i}>{`S${t.season} ${t.title}`}</li>)}
          </ul>
        </div>
      )}
      {c.finalsLost.length > 0 && (
        <div>
          <h2 className="section-title">Finals lost</h2>
          <ul className="plain-list">
            {c.finalsLost.map((t, i) => <li key={i}>{`S${t.season} ${finalOf(t.title)}`}</li>)}
          </ul>
        </div>
      )}
      {c.rsTitles.length > 0 && (
        <div>
          <h2 className="section-title">Regular-season titles</h2>
          <ul className="plain-list">
            {c.rsTitles.map((t, i) => <li key={i}>{`S${t.season} ${groupLabel('fbad2', t.group)}`}</li>)}
          </ul>
        </div>
      )}
      {c.mvps.length > 0 && (
        <div>
          <h2 className="section-title">MVPs</h2>
          <ul className="plain-list">
            {c.mvps.map((m, i) => <li key={i}>S{m.season} {AWARD_LABEL[m.award as keyof typeof AWARD_LABEL]} <PlayerLink id={m.playerId} players={roster} /></li>)}
          </ul>
        </div>
      )}
      {c.seriesMvps.length > 0 && (
        <div>
          <h2 className="section-title">Series MVPs</h2>
          <ul className="plain-list">
            {c.seriesMvps.map((m, i) => <li key={i}>S{m.season} {finalOf(m.title)} <PlayerLink id={m.playerId} players={roster} /></li>)}
          </ul>
        </div>
      )}
      {c.picks.length > 0 && (
        <div>
          <h2 className="section-title">Draft picks</h2>
          <ul className="plain-list">
            {c.picks.map((p, i) => (
              <li key={i}>
                <Link to={`/history/fbad2/drafts/${p.season}`}>S{p.season}</Link> pick {p.pick}: {p.playerId ? <PlayerLink id={p.playerId} players={roster} /> : p.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
