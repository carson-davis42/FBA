import { Link } from 'react-router-dom';
import type { Team } from '../../engine/shared/types';
import { useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { fbaSemifinalists } from '../../engine/history/hubTeams';
import { FeatureIcon, spreadTeams, type IconName } from './FeatureIcon';
import { HistoryLeagueSwitch } from './d2/HistoryLeagueSwitch';
import { findTeam, useFbaTeams } from './useTeams';
import { SkippedWarning } from './PlayerLink';
import './history.css';

const FEATURES: { to: string; title: string; icon: IconName }[] = [
  { to: '/history/fba/championships', title: 'Championships', icon: 'trophy' },
  { to: '/history/fba/teams', title: 'Teams', icon: 'teams' },
  { to: '/history/fba/drafts', title: 'Drafts', icon: 'draft' },
  { to: '/history/fba/awards', title: 'Awards', icon: 'awards' },
  { to: '/history/fba/awards/players', title: 'Awards by player', icon: 'awardsByPlayer' },
  { to: '/history/fba/leaders', title: 'Career leaders', icon: 'leaders' },
  { to: '/history/fba/streaks', title: 'Streaks', icon: 'streaks' },
  { to: '/history/fba/players', title: 'Players', icon: 'players' },
  { to: '/history/fba/hall-of-fame', title: 'Hall of Fame', icon: 'hall' },
  { to: '/history/fba/transactions', title: 'Transactions', icon: 'transactions' },
  { to: '/history/fba/events', title: 'Timeline', icon: 'timeline' },
];

export function HistoryHome() {
  const { seasons, errors, error } = useHistory('fba');
  const { teams } = useFbaTeams();
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons) return <p className="muted">Loading…</p>;
  const latest = seasons.reduce((m, s) => Math.max(m, s.season), 0);
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  /** The previous season's last four (conference finalists), else a spread of the league. */
  const finalists = ordered[0] ? fbaSemifinalists(ordered[0]).map(id => findTeam(teams, id)).filter((t): t is Team => !!t) : [];
  const lastFour = finalists.length ? finalists : spreadTeams(teams);
  const cards = latest > 0
    ? [FEATURES[0], FEATURES[1], FEATURES[2], FEATURES[3], { to: `/history/fba/season/${latest}`, title: 'Seasons', icon: 'seasons' as const }, ...FEATURES.slice(4)]
    : FEATURES;
  return (
    <section className="stack">
      <PageHeader kicker="FBA" title="History" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <div className="card-grid">
        {cards.map(c => (
          <Link key={c.title} to={c.to} className="card link headed feature" aria-label={c.title}>
            <FeatureIcon name={c.icon} teams={lastFour} season={latest} />
            <span className="feature-title">{c.title}</span>
          </Link>
        ))}
      </div>
      {ordered.length > 0 && (
        <div>
          <h2 className="section-title">Seasons</h2>
          <ul className="chips">
            {ordered.map(s => <li key={s.season}><Link className="chip" to={`/history/fba/season/${s.season}`}>S{s.season}</Link></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
