import { Link } from 'react-router-dom';
import { useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { d2LeagueChampions } from '../../../engine/history/hubTeams';
import type { Team } from '../../../engine/shared/types';
import { FeatureIcon, spreadTeams, type IconName } from '../FeatureIcon';
import { findTeam } from '../useTeams';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';
import { useD2Teams } from './useD2';

export function D2HistoryHome() {
  const { seasons, errors, error } = useHistory('fbad2');
  const { teams } = useD2Teams();
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons) return <p className="muted">Loading…</p>;
  const latest = seasons.reduce((m, s) => Math.max(m, s.season), 0);
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  /** The latest season's four league champions, else a spread of the league. */
  const found = ordered[0] ? d2LeagueChampions(ordered[0]).map(id => findTeam(teams, id)).filter((t): t is Team => !!t) : [];
  const champions = found.length ? found : spreadTeams(teams);
  const cards: { to: string; title: string; icon: IconName }[] = [
    { to: '/history/fbad2/championships', title: 'Championships', icon: 'trophy' },
    { to: '/history/fbad2/awards', title: 'Awards', icon: 'awards' },
    ...(latest > 0 ? [{ to: `/history/fbad2/season/${latest}`, title: 'Seasons', icon: 'seasons' as const }] : []),
    { to: '/history/fbad2/teams', title: 'Teams', icon: 'teams' },
    { to: '/history/fbad2/drafts', title: 'Drafts', icon: 'draft' },
  ];
  return (
    <section className="stack">
      <PageHeader kicker="FBAD2" title="History" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <div className="card-grid">
        {cards.map(c => (
          <Link key={c.title} to={c.to} className="card link headed feature" aria-label={c.title}>
            <FeatureIcon name={c.icon} teams={champions} season={latest} />
            <span className="feature-title">{c.title}</span>
          </Link>
        ))}
      </div>
      {ordered.length > 0 && (
        <div>
          <h2 className="section-title">Seasons</h2>
          <ul className="chips">
            {ordered.map(s => <li key={s.season}><Link className="chip" to={`/history/fbad2/season/${s.season}`}>S{s.season}</Link></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
