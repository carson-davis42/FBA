import { Link } from 'react-router-dom';
import { useHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { HistoryLeagueSwitch } from './d2/HistoryLeagueSwitch';
import { SkippedWarning } from './PlayerLink';
import './history.css';

const FEATURES: { to: string; title: string; text: string }[] = [
  { to: '/history/fba/championships', title: 'Championships', text: 'Every champion, runner-up and Finals MVP.' },
  { to: '/history/fba/teams', title: 'Teams', text: 'Every franchise: eras, logos and trophy case.' },
  { to: '/history/fba/drafts', title: 'Drafts', text: 'Every draft board since S49.' },
  { to: '/history/fba/awards', title: 'Awards', text: 'The winners of each award, season by season.' },
  { to: '/history/fba/awards/players', title: 'Awards by player', text: 'Award counts for every player, sortable.' },
  { to: '/history/fba/leaders', title: 'Career leaders', text: 'Points, games and points per game.' },
  { to: '/history/fba/players', title: 'Players', text: 'Search and browse every player in the record.' },
  { to: '/history/fba/hall-of-fame', title: 'Hall of Fame', text: 'The inducted classes, newest first.' },
  { to: '/history/fba/transactions', title: 'Transactions', text: 'Trades, signings and cuts by season.' },
  { to: '/history/fba/events', title: 'Timeline', text: 'Milestones, name changes and rule changes by season.' },
];

export function HistoryHome() {
  const { seasons, errors, error } = useHistory('fba');
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons) return <p className="muted">Loading…</p>;
  const latest = seasons.reduce((m, s) => Math.max(m, s.season), 0);
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  const cards = latest > 0
    ? [FEATURES[0], FEATURES[1], FEATURES[2], FEATURES[3], { to: `/history/fba/season/${latest}`, title: 'Seasons', text: 'Standings, playoffs and awards for any season.' }, ...FEATURES.slice(4)]
    : FEATURES;
  return (
    <section className="stack">
      <PageHeader kicker="FBA" title="History" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      <div className="card-grid">
        {cards.map(c => (
          <Link key={c.title} to={c.to} className="card link headed feature" aria-label={c.title}>
            <span className="feature-title">{c.title}</span>
            <span className="muted">{c.text}</span>
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
