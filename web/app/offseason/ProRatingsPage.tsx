import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collegeName } from '../../engine/college/state';
import { draftPath } from '../../engine/offseason/adjustAge';
import {
  finishProRatings, proMembershipBlockers, proRatingsPath, startProRatings, syncProRatings, type ProRatingsState,
} from '../../engine/offseason/proRatings';
import { docPath } from '../../engine/roster/state';
import type { WritesResult } from '../../engine/season/moves';
import { seasonDocPath } from '../../engine/season/state';
import type {
  CalendarFile, DraftFile, MetaFile, PlayersFile, RankingFile, RatingPauseFile, RostersFile, ScheduleFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, useSaving, type Versions } from '../api';
import { RankingTable } from '../rank/RankingTable';
import { commitDocs, newBatchId } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import '../pages/roster.css';

/**
 * Adjust Pro Ratings (/league/fba/ratings): rank every FBA roster player and every draft prospect, best first, then give each a new
 * rating. Suggestions come from last season's finished reset, else its first ratings pause, else the current roster ratings.
 */
export function ProRatingsPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const at = (path: string) => (n === undefined ? null : path);
  const ratingsPath = n === undefined ? '' : proRatingsPath(n);
  const fbaPath = n === undefined ? '' : docPath('fba', n);
  const txPath = n === undefined ? '' : docPath('fbaTx', n);
  const dPath = n === undefined ? '' : draftPath(n);
  const players = useDoc<PlayersFile>(at('players.json'));
  const calendar = useDoc<CalendarFile>(at('calendar.json'));
  const fba = useDoc<RostersFile>(at(fbaPath));
  const prevFba = useDoc<RostersFile>(n === undefined ? null : docPath('fba', n - 1));
  const tx = useDoc<TransactionsFile>(at(txPath));
  const draft = useDoc<DraftFile>(at(dPath));
  const ratings = useDoc<RankingFile>(at(ratingsPath));
  const prevRatings = useDoc<RankingFile>(n === undefined ? null : proRatingsPath(n - 1));
  const collegeTeams = useDoc<TeamsFile>(at('leagues/fbajc/teams.json'));
  const fbaTeams = useDoc<TeamsFile>(at('leagues/fba/teams.json'));
  const schedule = useDoc<ScheduleFile>(n === undefined ? null : seasonDocPath('schedule', 'fba', n - 1));
  const afterGame = schedule.data?.pauses.find(p => p.kind === 'ratings')?.afterGame;
  const pauseDoc = useDoc<RatingPauseFile>(n === undefined || afterGame === undefined ? null : seasonDocPath('ratingPause', 'fba', n - 1, afterGame));
  const emptyTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fba', season: n, entries: [] }), [n]);
  const autosave = useAutosaveDoc<RankingFile>(ratingsPath, ratings.data, ratings.version);
  const saving = useSaving();
  const busy = useRef(false);
  const [error, setError] = useState('');

  const required = [players, calendar, fba, collegeTeams];
  const optional = [prevFba, tx, draft, ratings, prevRatings, fbaTeams, schedule];
  const loadError = meta.error ?? required.find(d => d.error)?.error
    ?? [...optional, pauseDoc].find(d => d.error && !d.missing)?.error;
  const title = <h1>{n === undefined ? 'FBA ratings reset' : `S${n} FBA ratings reset`}</h1>;
  if (loadError) return <p className="error">Couldn't load the pro ratings: {loadError.message}</p>;
  if (
    n === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)
    || (afterGame !== undefined && !pauseDoc.data && !pauseDoc.missing)
  ) return <p className="muted">Loading…</p>;

  const doc = autosave.doc ?? ratings.data ?? null;
  const state: ProRatingsState = {
    season: n,
    calendar: calendar.data!,
    fba: fba.data!,
    prevFba: prevFba.data ?? null,
    draft: draft.data ?? null,
    players: players.data!,
    collegeTeams: collegeTeams.data!,
    ratings: doc,
    prevRatings: prevRatings.data ?? null,
    pause: pauseDoc.data ?? null,
    tx: tx.data ?? emptyTx!,
  };
  // Documents that don't exist yet are written without a version.
  const versions: Versions = {
    [ratingsPath]: doc ? autosave.version : ratings.version,
    [fbaPath]: fba.version,
    [dPath]: draft.version,
    [txPath]: tx.version,
    'calendar.json': calendar.version,
  };
  const teamOf = (team: string | null) => (team === null ? 'Prospect' : fbaTeams.data?.teams.find(t => t.teamId === team)?.name ?? team);

  const run = async (make: () => WritesResult) => {
    if (busy.current) return;
    busy.current = true;
    const result = make();
    if (!result.ok) {
      setError(result.problems.join('; '));
      busy.current = false;
      return;
    }
    setError('');
    try {
      await commitDocs(result.label, result.writes, versions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
    }
  };

  if (!doc) {
    return (
      <section>
        {title}
        <p className="muted">
          Rank every FBA player and every draft prospect, best first, starting from last season's ratings. Once everyone is ranked, give each
          a new rating; the app suggests the rating that held the same rank in last season's reset.
        </p>
        <button className="btn primary" disabled={saving} onClick={() => run(() => startProRatings(state))}>Start the pro ratings reset</button>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const blockers = proMembershipBlockers(state);
  return (
    <section>
      {title}
      {doc.locked && <p className="muted">Pro ratings are finished. <Link to="/league/fba/draft">Draft board ▸</Link></p>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {error && <p className="error">{error}</p>}
      {!doc.locked && blockers.length > 0 && (
        <p><button className="btn" disabled={saving} onClick={() => run(() => syncProRatings(state))}>Sync list</button></p>
      )}
      <RankingTable
        doc={doc}
        name={id => collegeName(state.players, id)}
        teamLabel={teamOf}
        otherLabel="College"
        onChange={autosave.update}
        extraBlockers={blockers}
        finishLabel="Finish ratings"
        onFinish={() => run(() => finishProRatings(state, { batchId: newBatchId() }))}
        busy={saving}
      />
    </section>
  );
}
