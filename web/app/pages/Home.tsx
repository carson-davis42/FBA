import { Link } from 'react-router-dom';
import { seasonDocPath } from '../../engine/season/state';
import { currentStepIndex } from '../../engine/shared/calendar';
import { LEAGUES, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile, CalendarStep, LeagueId, MetaFile, ResultsFile, ScheduleFile, SummaryFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { Badge } from '../components/Badge';
import { Hero } from '../components/Hero';
import { PortalBanner } from '../components/PortalBanner';
import { useSeasonState } from '../season/useSeasonState';
import { TickerChip } from '../shell/Ticker';
import { tickerItems } from '../shell/tickerItems';
import { stepTarget } from '../stepRoutes';
import { logoUrl } from '../components/logoUrl';
import './pages.css';

/** For an FBA/D2 league step: the Playoffs tab once that league's regular season is over, else null. */
function usePlayoffsTarget(step: CalendarStep | null, season: number | undefined): string | null {
  const lg = step?.kind === 'league' && (step.league === 'fba' || step.league === 'fbad2') ? step.league : null;
  const base = lg && season !== undefined ? `leagues/${lg}/S${season}` : null;
  const sched = useDoc<ScheduleFile>(base && `${base}/schedule.json`);
  const res = useDoc<ResultsFile>(base && `${base}/results.json`);
  if (!lg || !sched.data || !res.data) return null;
  return sched.data.games.length > 0 && res.data.games.length >= sched.data.games.length ? `/league/${lg}/playoffs` : null;
}

function ChampionRows({ league, meta }: { league: LeagueId; meta: MetaFile | undefined }) {
  const current = useDoc<SummaryFile>(meta ? `leagues/${league}/S${meta.currentSeason}/summary.json` : null);
  const last = useDoc<SummaryFile>(meta ? `leagues/${league}/S${meta.lastSeason[league]}/summary.json` : null);
  // The newest locked record: this season's once it is finished, else last season's.
  const data = current.data?.locked ? current.data : last.data;
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

function LatestResults({ cal }: { cal: CalendarFile }) {
  const { state } = useSeasonState('fba');
  const { data: lastSummary } = useDoc<SummaryFile>(state ? seasonDocPath('summary', 'fba', state.season - 1) : null);
  const t = tickerItems({ league: 'fba', label: 'FBA', state, lastSummary, calendar: cal });
  const teams = state?.teams.teams ?? [];
  return (
    <div className="card headed">
      <div className="card-head"><h3>Latest results</h3></div>
      <div className="latest-list">
        {t.items.map(it => <TickerChip key={it.key} item={it} teams={teams} season={state?.season ?? cal.season} />)}
      </div>
    </div>
  );
}

export function Home() {
  const { data: cal, error } = useDoc<CalendarFile>('calendar.json');
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const i = cal ? currentStepIndex(cal) : -1;
  const step = cal && i >= 0 ? cal.steps[i] : null;
  const playoffs = usePlayoffsTarget(step, meta?.currentSeason);
  if (error) return <p className="error">Couldn't load the calendar: {error.message}. Is the data server running?</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const title = !step ? `Season ${cal.season} complete` : step.id.endsWith('-qualifying') ? `World Cup qualifying S${cal.season}` : step.kind === 'league' && step.league ? `Play ${LEAGUE_LABEL[step.league]} S${cal.season}` : step.label;
  const target = playoffs ?? (step ? stepTarget(step) : '/next-season');

  return (
    <section>
      <PortalBanner />
      <Hero kicker={`Season ${cal.season}`} title={title} logo={<img src={logoUrl('FBA', 1)} alt="" />}>
        <Link className="btn primary big" to={target}>Continue ▸</Link>
      </Hero>
      <div className="card-grid home-leagues">
        {LEAGUES.map(lg => (
          <Link key={lg} className="card link" to={`/league/${lg}`}>
            <div className="card-head">
              <h2>{LEAGUE_LABEL[lg]}</h2>
              {step?.kind === 'league' && step.league === lg && <Badge kind="current">Current</Badge>}
            </div>
          </Link>
        ))}
      </div>
      <div className="grid-2">
        <div className="card headed">
          <div className="card-head"><h3>Last champions</h3></div>
          {LEAGUES.map(lg => <ChampionRows key={lg} league={lg} meta={meta} />)}
        </div>
        <LatestResults cal={cal} />
      </div>
    </section>
  );
}
