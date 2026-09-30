import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { boardPath, collegeName, emptyRecruiting } from '../../engine/college/state';
import { draftPath } from '../../engine/offseason/adjustAge';
import {
  backToSchool, boardOrder, declare, declareCandidates, draftToPortal, setProspectRating, type DraftBoardState,
} from '../../engine/offseason/draftBoard';
import {
  draftPick, draftStepId, finishDraft, finishDraftProblems, onTheClock, startDraft, startDraftProblems, type FbaDraftState,
} from '../../engine/offseason/fbaDraft';
import { lotteryPath } from '../../engine/offseason/lottery';
import { proRatingsPath } from '../../engine/offseason/proRatings';
import { docPath } from '../../engine/roster/state';
import type { WritesResult } from '../../engine/season/moves';
import { currentStepIndex } from '../../engine/shared/calendar';
import type {
  CalendarFile, DraftFile, DraftProspect, FreeAgentsFile, LotteryFile, MetaFile, PlayersFile, RankingFile, RecruitingFile, RostersFile,
  TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, useSaving, type Versions } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import '../pages/league.css';

/**
 * The draft board and the FBA draft (/league/fba/draft). Before the start: the prospects (with late-entrant ratings), the early
 * entrants who can still declare and "Start the draft". After it: the pick on the clock, the prospects left and the picks made.
 */
export function FbaDraftPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const at = (path: string) => (n === undefined ? null : path);
  const jcRostersPath = n === undefined ? '' : `leagues/fbajc/S${n}/rosters.json`;
  const collegeTxPath = n === undefined ? '' : `leagues/fbajc/S${n}/transactions.json`;
  const dPath = n === undefined ? '' : draftPath(n);
  const fbaPath = n === undefined ? '' : docPath('fba', n);
  const faPath = n === undefined ? '' : docPath('freeAgents', n);
  const fbaTxPath = n === undefined ? '' : docPath('fbaTx', n);
  const boardFile = n === undefined ? '' : boardPath(n - 1);
  const players = useDoc<PlayersFile>(at('players.json'));
  const calendar = useDoc<CalendarFile>(at('calendar.json'));
  const draft = useDoc<DraftFile>(at(dPath));
  const ratings = useDoc<RankingFile>(n === undefined ? null : proRatingsPath(n));
  const lottery = useDoc<LotteryFile>(n === undefined ? null : lotteryPath(n - 1));
  const fba = useDoc<RostersFile>(at(fbaPath));
  const freeAgents = useDoc<FreeAgentsFile>(at(faPath));
  const fbaTx = useDoc<TransactionsFile>(at(fbaTxPath));
  const fbaTeams = useDoc<TeamsFile>(at('leagues/fba/teams.json'));
  const jcRosters = useDoc<RostersFile>(at(jcRostersPath));
  const collegeTeams = useDoc<TeamsFile>(at('leagues/fbajc/teams.json'));
  const board = useDoc<RecruitingFile>(at(boardFile));
  const collegeTx = useDoc<TransactionsFile>(at(collegeTxPath));
  const emptyCollegeTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fbajc', season: n, entries: [] }), [n]);
  // The S{n} board is only written by Back to school (slot taken) and Portal; a missing one is created by the first of those.
  const emptyBoard = useMemo<RecruitingFile | undefined>(() => (n === undefined ? undefined : emptyRecruiting(n - 1)), [n]);
  const emptyFbaTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fba', season: n, entries: [] }), [n]);
  const emptyFreeAgents = useMemo<FreeAgentsFile | undefined>(() => (n === undefined ? undefined : { league: 'fba', season: n, locked: false, players: [] }), [n]);
  const saving = useSaving();
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState<Record<string, string>>({});

  const required = [players, calendar, collegeTeams];
  const optional = [draft, ratings, lottery, fba, freeAgents, fbaTx, fbaTeams, jcRosters, board, collegeTx];
  const loadError = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (loadError) return <p className="error">Couldn't load the draft: {loadError.message}</p>;
  if (n === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return <p className="muted">Loading…</p>;

  const title = <h1>S{n} draft</h1>;
  if (!draft.data) {
    return (
      <section>
        {title}
        <p>Run Adjust Age first.</p>
        <p><Link to="/offseason/adjust-age">Adjust Age ▸</Link></p>
      </section>
    );
  }
  if (!fba.data || !jcRosters.data) {
    return <p className="error">Couldn't load the draft: the S{n} rosters are missing.</p>;
  }

  const boardState: DraftBoardState = {
    season: n,
    draft: draft.data,
    rosters: jcRosters.data,
    board: board.data ?? emptyBoard!,
    collegeTeams: collegeTeams.data!,
    players: players.data!,
    collegeTx: collegeTx.data ?? emptyCollegeTx!,
    ratings: ratings.data ?? null,
  };
  const draftState: FbaDraftState = {
    season: n,
    calendar: calendar.data!,
    draft: draft.data,
    ratings: ratings.data ?? null,
    lottery: lottery.data ?? null,
    fba: fba.data,
    freeAgents: freeAgents.data ?? emptyFreeAgents!,
    players: players.data!,
    fbaTeams: fbaTeams.data ?? { league: 'fba', teams: [] },
    collegeTeams: collegeTeams.data!,
    tx: fbaTx.data ?? emptyFbaTx!,
  };
  // Documents that don't exist yet are written without a version.
  const versions: Versions = {
    [dPath]: draft.version,
    [jcRostersPath]: jcRosters.version,
    [collegeTxPath]: collegeTx.version,
    [boardFile]: board.version,
    [fbaPath]: fba.version,
    [faPath]: freeAgents.version,
    [fbaTxPath]: fbaTx.version,
    'calendar.json': calendar.version,
  };

  const school = (teamId: string) => collegeTeams.data!.teams.find(t => t.teamId === teamId)?.name ?? teamId;
  const proTeam = (teamId: string) => fbaTeams.data?.teams.find(t => t.teamId === teamId)?.name ?? teamId;
  const proAbbr = (teamId: string) => fbaTeams.data?.teams.find(t => t.teamId === teamId)?.abbr ?? teamId;
  const nameOf = (id: string) => collegeName(players.data!, id);

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
  const ctx = () => ({ batchId: newBatchId() });

  const saveRating = async (p: DraftProspect, text: string) => {
    if (text.trim() === String(p.fbaRating ?? '')) return;
    const value = text.trim() === '' ? NaN : Number(text);
    if (await run(() => setProspectRating(boardState, p.playerId, value))) {
      setTyped(t => Object.fromEntries(Object.entries(t).filter(([id]) => id !== p.playerId)));
    }
  };

  const d = draft.data;
  const started = d.started;
  const finished = d.locked;
  const onDraftStep = calendar.data!.steps[currentStepIndex(calendar.data!)]?.id === draftStepId(n);
  const ordered = boardOrder(boardState);
  const drafted = new Set(d.picks.flatMap(p => (p.playerId ? [p.playerId] : [])));
  const remaining = ordered.filter(p => !drafted.has(p.playerId));
  const canRate = (p: DraftProspect) => !started && setProspectRating(boardState, p.playerId, 50).ok;

  const prospectTable = (rows: DraftProspect[], actions: (p: DraftProspect) => React.ReactNode) => (
    <div className="table-wrap">
      <table className="roster" aria-label="Prospects">
        <thead>
          <tr><th>Name</th><th>Pos</th><th>School</th><th>Class</th><th className="num">College</th><th className="num">FBA</th><th /></tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.playerId}>
              <td>{nameOf(p.playerId)}</td>
              <td>{p.position}</td>
              <td>{school(p.college)}</td>
              <td>{p.classYear}</td>
              <td className="num">{p.collegeRating ?? '—'}</td>
              <td className="num">
                {canRate(p) ? (
                  <input
                    type="number" min={1} max={99} className="rating-input" aria-label={`FBA rating for ${nameOf(p.playerId)}`}
                    value={typed[p.playerId] ?? String(p.fbaRating ?? '')}
                    onChange={e => setTyped(t => ({ ...t, [p.playerId]: e.target.value }))}
                    onBlur={e => saveRating(p, e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void saveRating(p, e.currentTarget.value); }}
                  />
                ) : (p.fbaRating ?? '—')}
              </td>
              <td>{actions(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const pickTable = (
    <div className="table-wrap">
      <table className="roster" aria-label="Picks">
        <thead><tr><th className="num">Pick</th><th>Team</th><th>Player</th></tr></thead>
        <tbody>
          {[...d.picks].sort((a, b) => a.slot - b.slot).filter(p => finished || p.playerId).map(p => {
            const prospect = d.prospects.find(x => x.playerId === p.playerId);
            return (
              <tr key={p.slot}>
                <td className="num">{p.slot}</td>
                <td>{proTeam(p.owner)}{p.owner !== p.originalTeam && ` (from ${proAbbr(p.originalTeam)})`}</td>
                <td>
                  {p.playerId && prospect ? `${nameOf(p.playerId)} (${prospect.position}, ${school(prospect.college)})` : <span className="muted">No selection</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (finished) {
    return (
      <section>
        {title}
        <p>The S{n} draft is finished.</p>
        {error && <p className="error">{error}</p>}
        {pickTable}
      </section>
    );
  }

  if (started) {
    const clock = onTheClock(d);
    const finishProblems = finishDraftProblems(draftState);
    return (
      <section>
        {title}
        {clock
          ? (
            <p>
              <strong>
                On the clock: #{clock.slot} {proTeam(clock.owner)}{clock.owner !== clock.originalTeam && ` (from ${proAbbr(clock.originalTeam)})`}
              </strong>
            </p>
          )
          : <p className="muted">Every pick is made.</p>}
        {error && <p className="error">{error}</p>}
        {finishProblems.length === 0 && (
          <p>
            <button className="btn primary" disabled={saving} onClick={() => run(() => finishDraft(draftState, ctx()))}>Finish the draft</button>
          </p>
        )}
        <h2>Prospects</h2>
        {remaining.length === 0
          ? <p className="muted">No prospects are left.</p>
          : prospectTable(remaining, p => (
            <button className="btn" disabled={saving || !clock} onClick={() => run(() => draftPick(draftState, p.playerId, ctx()))}>Draft</button>
          ))}
        <h2>Picks so far</h2>
        {d.picks.some(p => p.playerId) ? pickTable : <p className="muted">No picks yet.</p>}
      </section>
    );
  }

  const candidates = declareCandidates(boardState);
  const bySchool = new Map<string, typeof candidates>();
  for (const c of candidates) bySchool.set(c.teamId, [...(bySchool.get(c.teamId) ?? []), c]);
  const startProblems = startDraftProblems(draftState);
  return (
    <section>
      {title}
      <p className="muted">The prospects for the S{n} draft. Early entrants can go back to school or into the transfer portal until the draft starts.</p>
      {error && <p className="error">{error}</p>}
      <h2>Prospects</h2>
      {ordered.length === 0
        ? <p className="muted">Nobody has declared yet.</p>
        : prospectTable(ordered, p => (p.senior
          ? null
          : (
            <>
              <button className="btn" disabled={saving} onClick={() => run(() => backToSchool(boardState, p.playerId, ctx()))}>Back to school</button>
              {' '}
              <button className="btn" disabled={saving} onClick={() => run(() => draftToPortal(boardState, p.playerId, ctx()))}>Portal</button>
            </>
          )))}
      <h2>Declare early entrants</h2>
      {candidates.length === 0
        ? <p className="muted">Nobody else is eligible to declare.</p>
        : [...bySchool.entries()].map(([teamId, list]) => (
          <div key={teamId} className="group">
            <h3>{school(teamId)}</h3>
            <ul aria-label={`${school(teamId)} early entrants`}>
              {list.map(c => (
                <li key={c.playerId}>
                  {nameOf(c.playerId)}, {c.classYear} {c.position}{c.rating !== null && `, ${c.rating}`}{' '}
                  <button className="btn" disabled={saving} onClick={() => run(() => declare(boardState, c.playerId, ctx()))}>Declare</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      <h2>Start the draft</h2>
      {onDraftStep && (
        <p>
          <button className="btn primary" disabled={saving || startProblems.length > 0} onClick={() => run(() => startDraft(draftState, ctx()))}>Start the draft</button>
        </p>
      )}
      {startProblems.length > 0 && <ul aria-label="Before the draft can start">{startProblems.map(p => <li key={p} className="muted">{p}</li>)}</ul>}
    </section>
  );
}
