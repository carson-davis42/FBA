import { Link, useSearchParams } from 'react-router-dom';
import { mulberry32 } from '../../engine/d2/random';
import type { MetaFile, Team, WcHostsFile } from '../../engine/shared/types';
import { calendarProblem } from '../../engine/season/moves';
import { worldCupStepId } from '../../engine/wc/state';
import { wcWrites } from '../../engine/wc/writes';
import { finishGroups, playGroupGame, playKnockoutGame, startWorldCup, type WorldCupState } from '../../engine/wc/worldcup';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { SubNav } from '../components/SubNav';
import { GroupsTab } from './GroupsTab';
import { KnockoutTab } from './KnockoutTab';
import { TeamsTab } from './TeamsTab';
import { useWcDocs } from './useWcDocs';
import { useWcRun, type WcFail, type WcOkOrWrites } from './useWcRun';
import './wc.css';

const GROUP_GAMES = 192;
const TABS = [{ id: 'groups', label: 'Groups' }, { id: 'knockout', label: 'Knockout' }, { id: 'teams', label: 'Teams' }];

export function WorldCupPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason ?? null;
  const docs = useWcDocs(season !== null && season % 2 === 0 ? season : null);
  const { saving, error, run } = useWcRun(docs.versions, docs.reload);
  const nextHosts = useDoc<WcHostsFile>(season !== null && season % 2 !== 0 ? 'leagues/fbawc/hosts.json' : null);
  const [params, setParams] = useSearchParams();

  const head = (title: string) => <PageHeader kicker="World Cup" title={title} />;
  if (season === null) return <section className="wc-page">{head('World Cup')}</section>;
  if (season % 2 !== 0) {
    const next = season + 1;
    const nextHost = nextHosts.data?.hosts.find(h => h.season === next);
    return (
      <section className="wc-page">
        {head(`S${next} World Cup`)}
        {nextHost && <p className="muted">Host: {nextHost.city}, {nextHost.country}</p>}
        <p className="muted">The World Cup is played in even seasons, after qualifying. This season is <Link to="/league/fbawc/qualifying">qualifying</Link>.</p>
      </section>
    );
  }
  if (docs.error) return <section className="wc-page">{head(`S${season} World Cup`)}<p className="error">{docs.error.message}</p></section>;
  if (!docs.ready || !docs.calendar || !docs.teams) return <section className="wc-page">{head(`S${season} World Cup`)}<p className="muted">Loading...</p></section>;

  const calendar = docs.calendar;
  const teamList = docs.teams.teams;
  const byId = new Map<string, Team>(teamList.map(t => [t.teamId, t]));
  const wc = docs.worldCup;
  const rosters = docs.rosters;
  const state: WorldCupState | null = wc && rosters ? { calendar, rosters, worldCup: wc } : null;
  const hostRow = docs.hosts?.hosts.find(h => h.season === season);
  const groupPlayed = wc?.groupGames.length ?? 0;
  const knockoutOn = !!wc && wc.knockout.length > 0;
  const finished = !!wc?.champion && !!calendar.steps.find(s => s.id === worldCupStepId(season))?.done;
  const stepProblem = finished ? null : calendarProblem(calendar, worldCupStepId(season), 'The World Cup is played');
  const blocked = saving || !!stepProblem;
  const notStarted: WcFail = { ok: false, problems: ['The World Cup has not been started'] };

  const q = docs.qualifying;
  const startProblem = !q || q.advanced.length !== 49
    ? `S${season - 1} qualifying must be finished first`
    : !docs.previousRosters ? `There are no S${season - 1} World Cup rosters`
    : !docs.d2Rosters ? `There are no FBAD2 rosters for S${season}` : null;

  const start = (): WcOkOrWrites | WcFail => {
    if (startProblem || !q || !docs.previousRosters || !docs.d2Rosters) return { ok: false, problems: [startProblem ?? 'Missing data'] };
    return startWorldCup(
      { season, calendar, d2Rosters: docs.d2Rosters, countries: teamList.map(t => t.teamId), qualifying: q, previous: docs.previousRosters, existing: wc },
      mulberry32(Date.now()),
    );
  };
  const next = (): WcOkOrWrites | WcFail => {
    if (!state) return notStarted;
    const rng = mulberry32(Date.now());
    return knockoutOn ? playKnockoutGame(state, rng) : playGroupGame(state, rng);
  };
  const allGroups = (): WcOkOrWrites | WcFail => {
    if (!state) return notStarted;
    const rng = mulberry32(Date.now());
    let s = state;
    let count = 0;
    for (let i = groupPlayed; i < GROUP_GAMES; i++) {
      const r = playGroupGame(s, rng);
      if (!r.ok) {
        if (count === 0) return r;
        break;
      }
      s = r.state;
      count++;
    }
    return { ok: true, label: `World Cup: ${count} group games played`, writes: wcWrites({ ok: true, state: s, changed: ['worldcup'], label: '' }) };
  };
  const allKnockout = (): WcOkOrWrites | WcFail => {
    if (!state) return notStarted;
    const rng = mulberry32(Date.now());
    let s = state;
    let count = 0;
    while (!s.worldCup?.champion) {
      const r = playKnockoutGame(s, rng);
      if (!r.ok) {
        if (count === 0) return r;
        break;
      }
      s = r.state;
      count++;
    }
    return { ok: true, label: `World Cup: ${count} knockout games played`, writes: wcWrites({ ok: true, state: s, changed: ['worldcup'], label: '' }) };
  };
  const finishG = (): WcOkOrWrites | WcFail => (state ? finishGroups(state) : notStarted);

  const requested = params.get('tab');
  const tab = TABS.some(t => t.id === requested) ? (requested as string) : 'groups';
  const status = !wc ? null : finished ? 'Finished' : knockoutOn ? (wc.champion ? 'Final played' : 'Knockout stage') : `${groupPlayed} of ${GROUP_GAMES} group games played · ${GROUP_GAMES - groupPlayed} to go`;

  return (
    <section className="wc-page">
      {head(`S${season} World Cup`)}
      {hostRow && <p className="muted">Host: {hostRow.city}, {hostRow.country}</p>}
      {status && <p className="muted">{status}</p>}
      {!wc && <p className="muted">16 groups of 4, with the host in group A. The top 2 in each group advance to a 32-team knockout bracket.</p>}
      {!finished && (
        <div className="wc-actions">
          {!wc ? (
            <button className="btn primary" disabled={blocked || !!startProblem} title={startProblem ?? stepProblem ?? undefined} onClick={() => void run(start)}>Start World Cup</button>
          ) : knockoutOn ? (
            <>
              <button className="btn primary" disabled={blocked || !!wc.champion} title={stepProblem ?? undefined} onClick={() => void run(next)}>Play next</button>
              <button className="btn" disabled={blocked || !!wc.champion} title={stepProblem ?? undefined} onClick={() => void run(allKnockout)}>Play all</button>
            </>
          ) : (
            <>
              <button className="btn primary" disabled={blocked || groupPlayed >= GROUP_GAMES} title={stepProblem ?? undefined} onClick={() => void run(next)}>Play next</button>
              <button className="btn" disabled={blocked || groupPlayed >= GROUP_GAMES} title={stepProblem ?? undefined} onClick={() => void run(allGroups)}>Play all groups</button>
              <button className="btn" disabled={blocked || groupPlayed < GROUP_GAMES} title={stepProblem ?? undefined} onClick={() => void run(finishG)}>Finish groups</button>
            </>
          )}
        </div>
      )}
      {startProblem && !wc && <p className="muted">{startProblem}</p>}
      {stepProblem && !finished && <p className="muted">{stepProblem}</p>}
      {error && <p className="error">{error}</p>}
      {wc && rosters && (
        <>
          <SubNav label="World Cup sections" items={TABS} active={tab} onSelect={id => setParams({ tab: id }, { replace: true })} />
          <div className="tab-panel" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'groups' && <GroupsTab wc={wc} byId={byId} season={season} />}
            {tab === 'knockout' && <KnockoutTab wc={wc} byId={byId} season={season} state={state} players={docs.players} summary={docs.summary} blocked={blocked} run={run} />}
            {tab === 'teams' && <TeamsTab wc={wc} rosters={rosters} byId={byId} season={season} />}
          </div>
        </>
      )}
    </section>
  );
}
