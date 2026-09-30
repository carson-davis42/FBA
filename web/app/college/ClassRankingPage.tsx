import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { classBlockers, classRankingPath, finishClassRanking, setConsensus, startClassRanking, type ClassRankState } from '../../engine/college/classRanking';
import { boardPath, collegeName, emptyRecruiting, nextClassBoardSeason } from '../../engine/college/state';
import { rankingBlockers } from '../../engine/rank/ranking';
import type { CalendarFile, MetaFile, PlayersFile, RankingFile, RecruitingFile, TransactionsFile } from '../../engine/shared/types';
import type { WritesResult } from '../../engine/season/moves';
import { useDoc, useSaving, type Versions } from '../api';
import { RankingTable } from '../rank/RankingTable';
import { PageHeader } from '../components/PageHeader';
import { commitDocs, newBatchId } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import '../pages/roster.css';

/**
 * Rank Class (/league/fbajc/class-ranking): rank the next class (board S{n}, class of n + 1) best first, then give each recruit a rating
 * and a consensus (which sets the stars). Suggestions come from last class's finished ranking.
 */
export function ClassRankingPage() {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const boardSeason = n === undefined ? undefined : nextClassBoardSeason(n);
  const rankingPath = boardSeason === undefined ? '' : classRankingPath(boardSeason);
  const txPath = n === undefined ? '' : `leagues/fbajc/S${n}/transactions.json`;
  const board = useDoc<RecruitingFile>(boardSeason === undefined ? null : boardPath(boardSeason));
  const ranking = useDoc<RankingFile>(boardSeason === undefined ? null : rankingPath);
  const prev = useDoc<RankingFile>(boardSeason === undefined ? null : classRankingPath(boardSeason - 1));
  const players = useDoc<PlayersFile>(n === undefined ? null : 'players.json');
  const calendar = useDoc<CalendarFile>(n === undefined ? null : 'calendar.json');
  const tx = useDoc<TransactionsFile>(n === undefined ? null : txPath);
  const emptyTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fbajc', season: n, entries: [] }), [n]);
  const autosave = useAutosaveDoc<RankingFile>(rankingPath, ranking.data, ranking.version);
  const saving = useSaving();
  const [error, setError] = useState('');

  const required = [players, calendar];
  const optional = [board, ranking, prev, tx];
  const loadError = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  const title = <PageHeader kicker="FBAJC" title={boardSeason === undefined ? 'Rank Class' : `Rank S${boardSeason + 1} Class`} />;
  if (loadError) return <p className="error">Couldn't load the class ranking: {loadError.message}</p>;
  if (n === undefined || boardSeason === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) {
    return <p className="muted">Loading…</p>;
  }

  // A missing next-class board means the class hasn't been created yet.
  const boardDoc = board.data ?? emptyRecruiting(boardSeason);
  if (!boardDoc.created) {
    return (
      <section className="stack">
        {title}
        <div className="card">
          <p className="muted">
            The S{boardDoc.classOf} class hasn't been created yet. <Link to={`/league/fbajc/recruiting?class=${boardDoc.classOf}&tab=class`}>Create the class ▸</Link>
          </p>
        </div>
      </section>
    );
  }

  const versions: Versions = {
    [rankingPath]: autosave.version,
    [boardPath(boardSeason)]: board.version,
    [txPath]: tx.version,
    'calendar.json': calendar.version,
  };
  const doc = autosave.doc ?? ranking.data ?? null;
  const state: ClassRankState = {
    board: boardDoc,
    ranking: doc,
    prevRanking: prev.data ?? null,
    players: players.data!,
    calendar: calendar.data!,
    tx: tx.data ?? emptyTx!,
    season: n,
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
            Rank every recruit in the S{boardDoc.classOf} class, best first. Then give each one a rating and a consensus; the app suggests the
            values that held the same rank in last year's class. The consensus sets the stars: 90 and up 5, 80 and up 4, 70 and up 3.
          </p>
          <button className="btn primary" disabled={saving} onClick={() => run(startClassRanking(state))}>Start ranking</button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const name = (id: string) => collegeName(state.players, id);
  // The table lists its own ranking blockers; only the class-specific ones (consensus, star mix) come from here.
  const own = new Set(rankingBlockers(doc, name));
  const extra = classBlockers(state).filter(b => !own.has(b));
  return (
    <section className="stack">
      {title}
      {doc.locked && <div className="card"><p className="muted">The S{boardDoc.classOf} class is ranked. <Link to={`/league/fbajc/recruiting?class=${boardDoc.classOf}&tab=board`}>Open the board ▸</Link></p></div>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {error && <p className="error">{error}</p>}
      <RankingTable
        doc={doc}
        name={name}
        teamLabel={team => team ?? '—'}
        leftLabel="Unranked"
        otherLabel="FBA"
        onChange={autosave.update}
        extraBlockers={extra}
        finishLabel="Finish ranking"
        onFinish={() => run(finishClassRanking(state, { batchId: newBatchId() }))}
        busy={saving}
        consensus={{ onSet: (id, v) => autosave.update(cur => setConsensus(cur, id, v)) }}
      />
    </section>
  );
}
