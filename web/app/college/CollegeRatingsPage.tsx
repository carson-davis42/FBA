import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collegeMembershipBlockers, collegeRatingsPath, finishCollegeRatings, startCollegeRatings, type CollegeRatingsState } from '../../engine/college/collegeRatings';
import { boardPath, collegeName, currentClassBoardSeason, emptyRecruiting } from '../../engine/college/state';
import type { CalendarFile, MetaFile, PlayersFile, RankingFile, RankingRow, RecruitingFile, RostersFile, TeamsFile, TransactionsFile } from '../../engine/shared/types';
import type { WritesResult } from '../../engine/season/moves';
import { useDoc, useSaving, type Versions } from '../api';
import { RankingTable } from '../rank/RankingTable';
import { PageHeader } from '../components/PageHeader';
import { commitDocs, newBatchId } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import '../pages/roster.css';

/**
 * Adjust College Ratings (/league/fbajc/ratings): rank every named returning player and every portal player, best first, then give each
 * a new rating. Suggestions come from the previous college reset (or, without one, this group's current ratings).
 */
export function CollegeRatingsPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const ratingsPath = n === undefined ? '' : collegeRatingsPath(n);
  const rostersPath = n === undefined ? '' : `leagues/fbajc/S${n}/rosters.json`;
  const txPath = n === undefined ? '' : `leagues/fbajc/S${n}/transactions.json`;
  const bPath = n === undefined ? '' : boardPath(currentClassBoardSeason(n));
  const board = useDoc<RecruitingFile>(n === undefined ? null : bPath);
  const rosters = useDoc<RostersFile>(n === undefined ? null : rostersPath);
  const prevRosters = useDoc<RostersFile>(n === undefined ? null : `leagues/fbajc/S${n - 1}/rosters.json`);
  const ratings = useDoc<RankingFile>(n === undefined ? null : ratingsPath);
  const prevRatings = useDoc<RankingFile>(n === undefined ? null : collegeRatingsPath(n - 1));
  const players = useDoc<PlayersFile>(n === undefined ? null : 'players.json');
  const calendar = useDoc<CalendarFile>(n === undefined ? null : 'calendar.json');
  const teams = useDoc<TeamsFile>(n === undefined ? null : 'leagues/fbajc/teams.json');
  const tx = useDoc<TransactionsFile>(n === undefined ? null : txPath);
  // Stable stand-ins for docs that don't exist yet.
  const emptyBoard = useMemo(() => (n === undefined ? undefined : emptyRecruiting(currentClassBoardSeason(n))), [n]);
  const emptyTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fbajc', season: n, entries: [] }), [n]);
  const autosave = useAutosaveDoc<RankingFile>(ratingsPath, ratings.data, ratings.version);
  const saving = useSaving();
  const [error, setError] = useState('');

  const required = [players, calendar, teams];
  const optional = [board, rosters, prevRosters, ratings, prevRatings, tx];
  const loadError = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  const title = <PageHeader kicker="FBAJC" title={n === undefined ? 'College ratings reset' : `S${n} college ratings reset`} />;
  if (loadError) return <p className="error">Couldn't load the college ratings: {loadError.message}</p>;
  if (n === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return <p className="muted">Loading…</p>;
  if (!rosters.data) {
    return <section className="stack">{title}<div className="card"><p className="muted">The S{n} college rosters don't exist yet. <Link to="/league/fbajc/recruiting">Go to recruiting ▸</Link></p></div></section>;
  }

  const versions: Versions = {
    [ratingsPath]: autosave.version,
    [rostersPath]: rosters.version,
    [bPath]: board.version,
    [txPath]: tx.version,
    'calendar.json': calendar.version,
  };
  const doc = autosave.doc ?? ratings.data ?? null;
  const state: CollegeRatingsState = {
    season: n,
    board: board.data ?? emptyBoard!,
    rosters: rosters.data,
    prevRosters: prevRosters.data ?? null,
    players: players.data!,
    ratings: doc,
    prevRatings: prevRatings.data ?? null,
    calendar: calendar.data!,
    tx: tx.data ?? emptyTx!,
  };
  const schoolOf = (team: string) => teams.data!.teams.find(t => t.teamId === team)?.name ?? team;
  const schoolLabel = (team: string | null, row?: RankingRow) => {
    if (team !== null) return schoolOf(team);
    const from = row ? state.board.portal.find(p => p.playerId === row.playerId)?.fromTeam : undefined;
    return from ? `Portal (from ${schoolOf(from)})` : 'Portal';
  };

  const run = async (result: WritesResult) => {
    if (!result.ok) {
      setError(result.problems.join('; '));
      return;
    }
    setError('');
    try {
      await commitDocs(result.label, result.writes, versions);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!doc) {
    return (
      <section className="stack">
        {title}
        <div className="card">
          <p className="muted">
            Rank every named returning player and every transfer portal player, best first, starting from their current ratings. Once everyone is
            ranked, give each player a new rating; the app suggests the rating that held the same rank in the last college reset. This year's class
            keeps its ratings.
          </p>
          <button className="btn primary" disabled={saving} onClick={() => run(startCollegeRatings(state))}>Start ratings reset</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="stack">
      {title}
      {doc.locked && <div className="card"><p className="muted">College ratings are finished. <Link to="/league/fbajc/recruiting?tab=board">Open the board ▸</Link></p></div>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {error && <p className="error">{error}</p>}
      <RankingTable
        doc={doc}
        name={id => collegeName(state.players, id)}
        teamLabel={schoolLabel}
        otherLabel="FBA"
        onChange={autosave.update}
        extraBlockers={collegeMembershipBlockers(state)}
        finishLabel="Finish ratings"
        onFinish={() => run(finishCollegeRatings(state, { batchId: newBatchId() }))}
        busy={saving}
      />
    </section>
  );
}
