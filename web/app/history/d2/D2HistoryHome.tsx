import { Link } from 'react-router-dom';
import { useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from './HistoryLeagueSwitch';

export function D2HistoryHome() {
  const { seasons, errors, error } = useHistory('fbad2');
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons) return <p className="muted">Loading…</p>;
  const latest = seasons.reduce((m, s) => Math.max(m, s.season), 0);
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  const cards: { to: string; title: string; text: string }[] = [
    { to: '/history/fbad2/championships', title: 'Championships', text: 'Every D2 champion, runner-up and Series MVP.' },
    { to: '/history/fbad2/awards', title: 'Awards', text: 'MVPs and regular-season champions, season by season.' },
    ...(latest > 0 ? [{ to: `/history/fbad2/season/${latest}`, title: 'Seasons', text: 'Standings, playoffs and awards for any season.' }] : []),
    { to: '/history/fbad2/teams', title: 'Teams', text: 'Every D2 team: leagues, titles and draft picks.' },
    { to: '/history/fbad2/drafts', title: 'Drafts', text: 'Every D2 draft board.' },
  ];
  return (
    <section className="stack">
      <PageHeader kicker="FBAD2" title="History" />
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
            {ordered.map(s => <li key={s.season}><Link className="chip" to={`/history/fbad2/season/${s.season}`}>S{s.season}</Link></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
