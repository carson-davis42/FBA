import { Link } from 'react-router-dom';
import { currentStepIndex } from '../../engine/shared/calendar';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile, LeagueId } from '../../engine/shared/types';
import { useDoc } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { TOOL_STEPS, stepTarget } from '../stepRoutes';
import './pages.css';

interface Tool { title: string; note: string; to: string }

const TOOLS: Partial<Record<LeagueId, Tool[]>> = {
  fba: [
    { title: 'Free agency', note: 'Sign and release players in the offseason market.', to: TOOL_STEPS['free-agency-offseason'] },
    { title: 'Adjust age', note: 'Age every player one year.', to: TOOL_STEPS['adjust-age'] },
    { title: 'Retirement', note: 'Retire players across the leagues.', to: TOOL_STEPS.retirement },
    { title: 'Pro ratings reset', note: 'Adjust FBA ratings for the new season.', to: TOOL_STEPS['adjust-pro-ratings-reset'] },
    { title: 'Hall of Fame', note: 'Review nominees and induct new members.', to: TOOL_STEPS['hall-of-fame-induction'] },
    { title: 'Draft lottery', note: 'Run the FBA draft lottery.', to: '/league/fba/lottery' },
    { title: 'FBA draft', note: 'Make the picks of the FBA draft.', to: '/league/fba/draft' },
  ],
  fbad2: [
    { title: 'Ratings reset', note: 'Adjust D2 ratings for the new season.', to: TOOL_STEPS['fbad2-ratings-reset'] },
    { title: 'D2 draft', note: 'Run the D2 draft from the pool.', to: TOOL_STEPS['fbad2-draft'] },
  ],
  fbajc: [
    { title: 'College ratings', note: 'Adjust college ratings for the new season.', to: TOOL_STEPS['adjust-college-ratings'] },
    { title: 'Recruiting class', note: 'Create the incoming recruiting class.', to: '/league/fbajc/recruiting' },
    { title: 'Class ranking', note: 'Rank the incoming class.', to: '/league/fbajc/class-ranking' },
  ],
};

const path = (to: string) => to.split('?')[0];

export function OffseasonHub() {
  const { data: cal, error } = useDoc<CalendarFile>('calendar.json');
  if (error) return <p className="error">Couldn't load the calendar: {error.message}</p>;
  if (!cal) return <p className="muted">Loading…</p>;
  const i = currentStepIndex(cal);
  const current = i >= 0 ? path(stepTarget(cal.steps[i])) : null;
  return (
    <section>
      <PageHeader kicker="Offseason" title="Offseason tools" />
      {(Object.keys(TOOLS) as LeagueId[]).map(lg => (
        <div key={lg}>
          <h2 className="hub-league">{LEAGUE_LABEL[lg]}</h2>
          <div className="card-grid">
            {TOOLS[lg]!.map(t => (
              <Link key={t.to} className="card link tool-tile" to={t.to}>
                <div className="card-head">
                  <h3>{t.title}</h3>
                  {current === path(t.to) && <Badge kind="current">Current</Badge>}
                </div>
                <p className="muted">{t.note}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
