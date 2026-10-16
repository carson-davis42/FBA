import { Link } from 'react-router-dom';
import { isJcNationalTitle, jcSeasonLabel } from '../../../engine/history/jc';
import { useHistory } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { FeatureIcon, type IconName } from '../FeatureIcon';
import { SkippedWarning } from '../PlayerLink';
import '../history.css';
import { HistoryLeagueSwitch } from '../d2/HistoryLeagueSwitch';
import { JcTeam, useJcTeams } from './useJc';

export function JcHistoryHome() {
  const { seasons, errors, error } = useHistory('fbajc');
  const { settled, teams } = useJcTeams();
  if (error) return <p className="error">Couldn't load the history: {error.message}</p>;
  if (!seasons || !settled) return <p className="muted">Loading…</p>;
  const ordered = [...seasons].sort((a, b) => b.season - a.season);
  const latest = ordered[0];
  const champ = latest?.champions.find(c => isJcNationalTitle(c.title));
  const cards: { to: string; title: string; icon: IconName }[] = [
    { to: '/history/fbajc/championships', title: 'Championships', icon: 'trophy' },
    { to: '/history/fbajc/awards', title: 'Awards', icon: 'awards' },
    ...(latest ? [{ to: `/history/fbajc/season/${latest.season}`, title: 'Seasons', icon: 'seasons' as const }] : []),
    { to: '/history/fbajc/recruiting', title: 'Recruiting', icon: 'recruiting' },
    { to: '/history/fbajc/schools', title: 'Schools', icon: 'schools' },
  ];
  return (
    <section className="stack">
      <PageHeader kicker="FBAJC" title="History" />
      <HistoryLeagueSwitch />
      <SkippedWarning errors={errors} />
      {latest && champ && (
        <p className="muted">
          Latest champion, {jcSeasonLabel(latest.season)}: <b><JcTeam teams={teams} teamId={champ.teamId} name={champ.champion} season={latest.season} /></b>
        </p>
      )}
      <div className="card-grid">
        {cards.map(c => (
          <Link key={c.title} to={c.to} className="card link headed feature" aria-label={c.title}>
            <FeatureIcon name={c.icon} />
            <span className="feature-title">{c.title}</span>
          </Link>
        ))}
      </div>
      {ordered.length > 0 && (
        <div>
          <h2 className="section-title">Seasons</h2>
          <ul className="chips">
            {ordered.map(s => <li key={s.season}><Link className="chip" to={`/history/fbajc/season/${s.season}`}>S{s.season}</Link></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
