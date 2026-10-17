import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collegeName } from '../../engine/college/state';
import { draftPath } from '../../engine/offseason/adjustAge';
import {
  finishRookieRatings, ROOKIE_MIN_RATING, rookieBlockers, rookieOrder, setRookieRating, type RookieRatingsState,
} from '../../engine/offseason/rookieRatings';
import { docPath } from '../../engine/roster/state';
import type { WritesResult } from '../../engine/season/moves';
import { currentStepIndex, rookieStepId } from '../../engine/shared/calendar';
import type { CalendarFile, DraftFile, FreeAgentsFile, MetaFile, PlayersFile, ReservesFile, RostersFile, TeamsFile, TransactionsFile } from '../../engine/shared/types';
import { useDoc, useSaving, type Versions } from '../api';
import { PageHeader } from '../components/PageHeader';
import { commitDocs, newBatchId } from '../roster/commit';
import './offseason.css';

/**
 * Rate S{n} Rookies (/league/fba/rookies): right after the FBA draft, the class in prospect-ranking order, rated from the top down (55 to 99).
 * Whoever is left unrated goes to the D2 draft pool in rank order and never reaches FBA free agency.
 */
export function RookieRatingsPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const at = (path: string) => (n === undefined ? null : path);
  const paths = n === undefined
    ? null
    : { draft: draftPath(n), fba: docPath('fba', n), fa: docPath('freeAgents', n), reserves: docPath('reserves', n), tx: docPath('fbaTx', n) };
  const players = useDoc<PlayersFile>(at('players.json'));
  const calendar = useDoc<CalendarFile>(at('calendar.json'));
  const draft = useDoc<DraftFile>(at(paths?.draft ?? ''));
  const fba = useDoc<RostersFile>(at(paths?.fba ?? ''));
  const freeAgents = useDoc<FreeAgentsFile>(at(paths?.fa ?? ''));
  const reserves = useDoc<ReservesFile>(at(paths?.reserves ?? ''));
  const tx = useDoc<TransactionsFile>(at(paths?.tx ?? ''));
  const fbaTeams = useDoc<TeamsFile>(at('leagues/fba/teams.json'));
  const collegeTeams = useDoc<TeamsFile>(at('leagues/fbajc/teams.json'));
  const saving = useSaving();
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState<Record<string, string>>({});

  const all = [players, calendar, draft, fba, freeAgents, reserves, tx, fbaTeams, collegeTeams];
  const loadError = meta.error ?? all.find(d => d.error && !d.missing)?.error;
  if (loadError) return <p className="error">Couldn't load the rookie ratings: {loadError.message}</p>;
  if (n === undefined || !paths || all.some(d => !d.data && !d.missing)) return <p className="muted">Loading…</p>;
  const title = <PageHeader kicker="FBA" title={`Rate S${n} rookies`} />;
  if (!draft.data || !fba.data || !players.data || !calendar.data) return <section className="stack">{title}<p className="muted">The S{n} draft isn't set up yet.</p></section>;

  const state: RookieRatingsState = {
    season: n,
    calendar: calendar.data,
    draft: draft.data,
    fba: fba.data,
    freeAgents: freeAgents.data ?? { league: 'fba', season: n, locked: false, players: [] },
    reserves: reserves.data ?? { league: 'fbad2', season: n, locked: false, players: [] },
    players: players.data,
    tx: tx.data ?? { league: 'fba', season: n, entries: [] },
  };
  const versions: Versions = {
    [paths.draft]: draft.version, [paths.fba]: fba.version, [paths.fa]: freeAgents.version, [paths.reserves]: reserves.version,
    [paths.tx]: tx.version, 'calendar.json': calendar.version,
  };
  const run = async (make: () => WritesResult): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    const result = make();
    if (!result.ok) {
      setError(result.problems.join('; '));
      busy.current = false;
      return false;
    }
    setError('');
    try {
      await commitDocs(result.label, result.writes, versions);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      busy.current = false;
    }
  };

  const stepId = rookieStepId(n);
  const current = calendar.data.steps[currentStepIndex(calendar.data)]?.id === stepId;
  const stepDone = calendar.data.steps.find(s => s.id === stepId)?.done ?? false;
  if (!current) {
    return (
      <section className="stack">
        {title}
        <div className="card">
          {stepDone
            ? <p className="muted">The S{n} rookies are rated.</p>
            : <p>Rookies are rated at the Rate S{n} Rookies step, after the FBA draft (current step: {calendar.data.steps[currentStepIndex(calendar.data)]?.label ?? 'none'}).</p>}
          <p><Link to="/league/fba/draft">Draft board ▸</Link></p>
        </div>
      </section>
    );
  }

  const order = rookieOrder(state.draft, state.players);
  const ratings = state.draft.rookieRatings ?? {};
  const blockers = rookieBlockers(state);
  const school = (id: string) => collegeTeams.data?.teams.find(t => t.teamId === id)?.name ?? id;
  const proTeam = (id: string) => fbaTeams.data?.teams.find(t => t.teamId === id)?.name ?? id;
  const pickOf = (id: string) => state.draft.picks.find(p => p.playerId === id);
  const rated = Object.keys(ratings).length;

  const save = async (id: string, text: string) => {
    const t = text.trim();
    if (t === String(ratings[id] ?? '')) {
      setTyped(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
      return;
    }
    const value = t === '' ? null : Number(t);
    if (await run(() => setRookieRating(state, id, value))) setTyped(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
  };

  return (
    <section className="stack">
      {title}
      <p className="muted">
        The class in the prospect rankings, best first. Rate from the top down, {ROOKIE_MIN_RATING} to 99, and stop where the talent runs out: everyone left
        unrated goes to the D2 draft pool in this order and is not eligible for FBA free agency.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <div className="table-wrap tall">
          <table className="stat-table" aria-label="Rookie ratings">
            <thead><tr><th className="num">#</th><th>Name</th><th>Pos</th><th>School</th><th>Drafted by</th><th className="num">Rating</th></tr></thead>
            <tbody>
              {order.map((p, i) => {
                const pick = pickOf(p.playerId);
                const name = collegeName(state.players, p.playerId);
                return (
                  <tr key={p.playerId}>
                    <td className="num">{i + 1}</td>
                    <td>{name}</td>
                    <td>{p.position}</td>
                    <td>{school(p.college)}</td>
                    <td>{pick ? `#${pick.slot} · ${proTeam(pick.owner)}` : 'Undrafted'}</td>
                    <td className="num">
                      <input
                        type="number" min={ROOKIE_MIN_RATING} max={99} className={`rating-input${typed[p.playerId] !== undefined ? ' changed' : ''}`}
                        aria-label={`Rookie rating for ${name}`} value={typed[p.playerId] ?? String(ratings[p.playerId] ?? '')}
                        onChange={e => setTyped(prev => ({ ...prev, [p.playerId]: e.target.value }))}
                        onBlur={e => void save(p.playerId, e.currentTarget.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void save(p.playerId, e.currentTarget.value); }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>Finish</h2>
        <p className="muted">{rated} rated, {order.length - rated} to the D2 draft pool.</p>
        {blockers.length > 0 && <ul className="plain-list tight" aria-label="Before the ratings can be finished">{blockers.map(b => <li key={b} className="muted">{b}</li>)}</ul>}
        <p>
          <button className="btn primary" disabled={saving || blockers.length > 0} onClick={() => run(() => finishRookieRatings(state, { batchId: newBatchId() }))}>
            Finish the rookie ratings
          </button>
        </p>
      </div>
    </section>
  );
}
