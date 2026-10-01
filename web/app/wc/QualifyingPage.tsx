import { Link } from 'react-router-dom';
import { mulberry32 } from '../../engine/d2/random';
import type { MetaFile, Team } from '../../engine/shared/types';
import { calendarProblem } from '../../engine/season/moves';
import { qualifyingClinch } from '../../engine/wc/clinch';
import { finishQualifying, playQualifyingGame, qualifyingTable, startQualifying, type QualifyingState } from '../../engine/wc/qualifying';
import { countryRating } from '../../engine/wc/rating';
import { qualifyingStepId } from '../../engine/wc/state';
import { wcWrites } from '../../engine/wc/writes';
import { useDoc } from '../api';
import { ClinchLegend, RankCell } from '../components/Clinch';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { useWcDocs } from './useWcDocs';
import { useWcRun, type WcFail, type WcOkOrWrites } from './useWcRun';
import './wc.css';

const GAMES = 210;

export function QualifyingPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason ?? null;
  const docs = useWcDocs(season !== null && season % 2 === 1 ? season : null);
  const { saving, error, run } = useWcRun(docs.versions, docs.reload);

  if (season === null) return <section className="wc-page"><PageHeader kicker="World Cup" title="Qualifying" /></section>;
  if (season % 2 === 0) {
    return <section className="wc-page"><PageHeader kicker="World Cup" title="Qualifying" /><p className="muted">Qualifying runs in odd seasons; the next is S{season + 1}. The World Cup itself is this season.</p></section>;
  }
  if (docs.error) return <section className="wc-page"><PageHeader kicker="World Cup" title={`S${season} Qualifying`} /><p className="error">{docs.error.message}</p></section>;
  if (!docs.ready || !docs.calendar || !docs.teams) return <section className="wc-page"><PageHeader kicker="World Cup" title={`S${season} Qualifying`} /><p className="muted">Loading...</p></section>;

  const calendar = docs.calendar;
  const teamList = docs.teams.teams;
  const byId = new Map<string, Team>(teamList.map(t => [t.teamId, t]));
  const q = docs.qualifying;
  const rosters = docs.rosters;
  const state: QualifyingState | null = q && rosters ? { calendar, rosters, qualifying: q } : null;
  const finished = !!q && q.advanced.length > 0;
  const played = q?.games.length ?? 0;
  const stepProblem = finished ? null : calendarProblem(calendar, qualifyingStepId(season), 'Qualifying is played');
  const blocked = saving || !!stepProblem;
  const notStarted: WcFail = { ok: false, problems: ['Qualifying has not been started'] };

  const start = (): WcOkOrWrites | WcFail => {
    if (!docs.d2Rosters) return { ok: false, problems: [`There are no FBAD2 rosters for S${season}`] };
    const hostName = docs.hosts?.hosts.find(h => h.season === season + 1)?.country;
    const host = teamList.find(t => t.name === hostName);
    if (!host) return { ok: false, problems: [`No host is set for S${season + 1}`] };
    return startQualifying(
      { season, calendar, d2Rosters: docs.d2Rosters, countries: teamList.map(t => t.teamId), host: host.teamId, previousWc: docs.previousRosters, existing: q },
      mulberry32(Date.now()),
    );
  };
  const next = (): WcOkOrWrites | WcFail => (state ? playQualifyingGame(state, mulberry32(Date.now())) : notStarted);
  const all = (): WcOkOrWrites | WcFail => {
    if (!state) return notStarted;
    const rng = mulberry32(Date.now());
    let s = state;
    let count = 0;
    for (let i = played; i < GAMES; i++) {
      const r = playQualifyingGame(s, rng);
      if (!r.ok) {
        if (count === 0) return r;
        break;
      }
      s = r.state;
      count++;
    }
    return { ok: true, label: `Qualifying: ${count} games played`, writes: wcWrites({ ok: true, state: s, changed: ['qualifying'], label: '' }) };
  };
  const finish = (): WcOkOrWrites | WcFail => (state ? finishQualifying(state) : notStarted);

  const status = !q ? null : finished ? 'Finished' : `${played} of ${GAMES} games played · ${GAMES - played} to go`;

  let body: JSX.Element | null = null;
  if (q) {
    const table = qualifyingTable(q);
    const clinch = qualifyingClinch(q);
    const rows = finished ? table.rows.slice(0, 49) : table.rows;
    const label = (id: string) => byId.get(id)?.name ?? id;
    body = (
      <>
        <section>
          <h2>Automatic qualifiers</h2>
          <ul className="wc-auto">
            {q.auto.map(id => {
              const t = byId.get(id);
              return (
                <li key={id} className={id === q.host ? 'wc-host' : undefined}>
                  {t ? <TeamName team={t} season={season} to={`/league/fbawc/team/${id}`} /> : id}
                  <span className="muted">{rosters ? countryRating(rosters.teams[id] ?? []).toFixed(1) : ''}</span>
                  {id === q.host && <span className="wc-host-tag">Host</span>}
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h2>Qualifying table</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Team</th><th>W-L</th><th>PF-PA</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const t = byId.get(r.teamId);
                  return (
                    <tr key={r.teamId} className={!finished && i === 48 ? 'wc-cut' : undefined}>
                      <RankCell kind={clinch[r.teamId] ?? null} league="fbawc">{i + 1}</RankCell>
                      <td>{t ? <TeamName team={t} season={season} to={`/league/fbawc/team/${r.teamId}`} /> : r.teamId}</td>
                      <td>{r.w}-{r.l}</td>
                      <td>{r.pf}-{r.pa}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {q.games.length > 0 && table.ties.length > 0 && <ul className="wc-ties muted">{table.ties.map(n => <li key={n}>{n}</li>)}</ul>}
          <ClinchLegend kinds={rows.map(r => clinch[r.teamId] ?? null)} league="fbawc" />
        </section>
        <section>
          <h2>Games</h2>
          <ol className="wc-games">
            {[...q.schedule].reverse().map(g => {
              const r = q.games[g.gameNo - 1];
              const watch = !r && !finished && !stepProblem && g.gameNo === played + 1;
              return (
                <li key={g.gameNo} className={r ? undefined : 'wc-unplayed'}>
                  {`G${g.gameNo} ${label(g.home)} ${r ? `${r.homePts}–${r.awayPts}` : 'vs'} ${label(g.away)}`}
                  {r && <>{' '}<Link to={`/league/fbawc/game/${g.gameNo}`}>Box score</Link></>}
                  {watch && <>{' '}<Link to={`/league/fbawc/game/${g.gameNo}`}>Watch</Link></>}
                </li>
              );
            })}
          </ol>
        </section>
      </>
    );
  }

  return (
    <section className="wc-page">
      <PageHeader kicker="World Cup" title={`S${season} Qualifying`} />
      {status && <p className="muted">{status}</p>}
      {!q && <p className="muted">The top 15 countries by rating go through, the host replaces #15 if it is not among them, and the other 70 play 6 games each. The top 49 advance.</p>}
      {!finished && (
        <div className="wc-actions">
          {!q ? (
            <button className="btn primary" disabled={blocked} title={stepProblem ?? undefined} onClick={() => void run(start)}>Start qualifying</button>
          ) : (
            <>
              {played < GAMES && !stepProblem
                ? <Link className="btn primary" to={`/league/fbawc/game/${played + 1}`}>Watch next</Link>
                : <button className="btn primary" disabled title={stepProblem ?? undefined}>Watch next</button>}
              <button className="btn" disabled={blocked || played >= GAMES} title={stepProblem ?? undefined} onClick={() => void run(next)}>Play next</button>
              <button className="btn" disabled={blocked || played >= GAMES} title={stepProblem ?? undefined} onClick={() => void run(all)}>Play all</button>
              <button className="btn" disabled={blocked || played < GAMES} title={stepProblem ?? undefined} onClick={() => void run(finish)}>Finish</button>
            </>
          )}
        </div>
      )}
      {stepProblem && !finished && <p className="muted">{stepProblem}</p>}
      {error && <p className="error">{error}</p>}
      {finished && <p><Link to="/calendar">Continue to the World Cup</Link></p>}
      {body}
    </section>
  );
}
