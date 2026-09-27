import { Link } from 'react-router-dom';
import { currentStepIndex } from '../../engine/shared/calendar';
import { LEAGUES, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile, LeagueId, MetaFile, SummaryFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { stepTarget } from '../stepRoutes';
import './pages.css';

function ChampionRows({ league, meta }: { league: LeagueId; meta: MetaFile | undefined }) {
  const season = meta?.lastSeason[league];
  const { data } = useDoc<SummaryFile>(season === undefined ? null : `leagues/${league}/S${season}/summary.json`);
  if (!data) return null;
  if (!data.champions.length) {
    return <div className="champ-row"><span>{LEAGUE_LABEL[league]} S{data.season}</span><span className="muted">—</span></div>;
  }
  return (
    <>
      {data.champions.map(c => (
        <div className="champ-row" key={c.title}>
          <span>
            {LEAGUE_LABEL[league]} S{data.season} · {c.title}
            {data.host && <span className="muted"> (host: {data.host})</span>}
          </span>
          <b>{c.champion}</b>
        </div>
      ))}
    </>
  );
}

export function Home() {
  const { data: cal, error } = useDoc<CalendarFile>('calendar.json');
  const { data: meta } = useDoc<MetaFile>('meta.json');
  if (error) return <p className="error">Couldn't load the calendar: {error.message}. Is the data server running?</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const i = currentStepIndex(cal);
  const step = i < 0 ? null : cal.steps[i];
  const title = !step ? `Season ${cal.season} complete` : step.kind === 'league' && step.league ? `Play ${LEAGUE_LABEL[step.league]} S${cal.season}` : step.label;
  const target = step ? stepTarget(step) : '/calendar';

  return (
    <section>
      <div className="hero">
        <img src="/logos/FBA/1" alt="" />
        <div>
          <div className="eyebrow">Up next</div>
          <div className="title">{title}</div>
        </div>
        <Link className="btn primary" to={target}>Continue ▸</Link>
      </div>
      <div className="grid-2">
        <div className="card">
          <h3>Last champions</h3>
          {LEAGUES.map(lg => <ChampionRows key={lg} league={lg} meta={meta} />)}
        </div>
      </div>
    </section>
  );
}
