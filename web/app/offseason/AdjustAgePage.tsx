import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { boardPath, collegeName } from '../../engine/college/state';
import { ADJUST_AGE_STEP, adjustAge, adjustAgePreview, draftPath, type AdjustAgeState } from '../../engine/offseason/adjustAge';
import { docPath } from '../../engine/roster/state';
import type {
  CalendarFile, DraftFile, FreeAgentsFile, MetaFile, PlayersFile, RecruitingFile, ReservesFile, RostersFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, useSaving, type Versions } from '../api';
import { PageHeader } from '../components/PageHeader';
import { commitDocs, newBatchId } from '../roster/commit';
import './offseason.css';

const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/**
 * Adjust Age (/offseason/adjust-age): pro ages, the S{n} college rosters, the S{n} Seniors to the draft board and the S{n} commits placed
 * in one batch. The S{n} college transactions and the draft board may not exist yet.
 */
export function AdjustAgePage() {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const at = (path: string) => (n === undefined ? null : path);
  const calendar = useDoc<CalendarFile>(at('calendar.json'));
  const players = useDoc<PlayersFile>(at('players.json'));
  const fba = useDoc<RostersFile>(n === undefined ? null : docPath('fba', n));
  const freeAgents = useDoc<FreeAgentsFile>(n === undefined ? null : docPath('freeAgents', n));
  const fbaTx = useDoc<TransactionsFile>(n === undefined ? null : docPath('fbaTx', n));
  const d2 = useDoc<RostersFile>(n === undefined ? null : docPath('d2', n));
  const reserves = useDoc<ReservesFile>(n === undefined ? null : docPath('reserves', n));
  const prevCollege = useDoc<RostersFile>(n === undefined ? null : `leagues/fbajc/S${n - 1}/rosters.json`);
  const collegeTeams = useDoc<TeamsFile>(at('leagues/fbajc/teams.json'));
  const board = useDoc<RecruitingFile>(n === undefined ? null : boardPath(n - 1));
  const collegeTxPath = n === undefined ? '' : `leagues/fbajc/S${n}/transactions.json`;
  const collegeTx = useDoc<TransactionsFile>(n === undefined ? null : collegeTxPath);
  const draft = useDoc<DraftFile>(n === undefined ? null : draftPath(n));
  const emptyTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fbajc', season: n, entries: [] }), [n]);
  const saving = useSaving();
  const busy = useRef(false);
  const [error, setError] = useState('');

  const required = [calendar, players, fba, fbaTx, d2, collegeTeams];
  const optional = [freeAgents, reserves, prevCollege, board, collegeTx, draft];
  const loadError = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (loadError) return <p className="error">Couldn't load Adjust Age: {loadError.message}</p>;
  if (n === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return <p className="muted">Loading…</p>;

  const title = <PageHeader kicker="Offseason" title="Adjust Age" />;
  const done = calendar.data!.steps.find(s => s.id === ADJUST_AGE_STEP)?.done ?? false;
  if (done) {
    return (
      <section className="stack">
        {title}
        <div className="card">
          <p>Ages are adjusted.</p>
          <div className="chips"><Link className="chip" to="/league/fba/draft">Draft board ▸</Link> <Link className="chip" to="/league/fba/ratings">Pro ratings ▸</Link></div>
        </div>
      </section>
    );
  }

  const state: AdjustAgeState = {
    season: n,
    calendar: calendar.data!,
    meta: meta.data!,
    players: players.data!,
    fba: fba.data!,
    freeAgents: freeAgents.data ?? null,
    d2: d2.data!,
    reserves: reserves.data ?? null,
    prevCollege: prevCollege.data ?? null,
    board: board.data ?? null,
    collegeTeams: collegeTeams.data!,
    fbaTx: fbaTx.data!,
    collegeTx: collegeTx.data ?? emptyTx!,
    draftExists: Boolean(draft.data),
  };
  const result = adjustAgePreview(state);
  if (!result.ok) {
    return (
      <section className="stack">
        {title}
        <div className="card">{result.problems.map(p => <p key={p} className="error">{p}</p>)}</div>
      </section>
    );
  }
  const { aged, seniors, xSeniors, placed, displaced } = result.preview;
  const school = (teamId: string) => collegeTeams.data!.teams.find(t => t.teamId === teamId)?.name ?? teamId;

  // Documents that don't exist yet (the S{n} college rosters, the draft board, maybe the college transactions) are written without a version.
  const versions: Versions = {
    [docPath('fba', n)]: fba.version,
    [docPath('freeAgents', n)]: freeAgents.version,
    [docPath('d2', n)]: d2.version,
    [docPath('reserves', n)]: reserves.version,
    [`leagues/fbajc/S${n}/rosters.json`]: null,
    [boardPath(n - 1)]: board.version,
    [draftPath(n)]: draft.version,
    'players.json': players.version,
    'meta.json': meta.version,
    'calendar.json': calendar.version,
    [docPath('fbaTx', n)]: fbaTx.version,
    [collegeTxPath]: collegeTx.version,
  };

  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    const move = adjustAge(state, { batchId: newBatchId() });
    if (!move.ok) {
      setError(move.problems.join('; '));
      busy.current = false;
      return;
    }
    try {
      await commitDocs(move.label, move.writes, versions);
    } catch (e) {
      setError((e as Error).message);
      busy.current = false;
    }
  };

  return (
    <section className="stack">
      {title}
      <div className="card headed">
        <p className="muted">Everyone gets a year older, the college classes move up and the S{n} commitments join their schools.</p>
        <ul className="plain-list">
          <li>{plural(aged, 'player ages a year', 'players age a year')}</li>
          <li>{plural(seniors, `Senior enters the S${n} draft`, `Seniors enter the S${n} draft`)}</li>
          <li>{plural(xSeniors, 'unnamed Senior leaves', 'unnamed Seniors leave')}</li>
          <li>{plural(placed, 'commitment joins its school', 'commitments join their schools')}</li>
        </ul>
      </div>
      {displaced.length > 0 && (
        <div className="card">
          <h2>Displaced to the portal</h2>
          <ul className="plain-list" aria-label="Displaced to the portal">
            {displaced.map(d => (
              <li key={d.playerId}>{collegeName(players.data!, d.playerId)}, {school(d.teamId)}, {d.classYear}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="card toolbar">
        <button className="btn primary" disabled={saving} onClick={run}>Adjust Age</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
