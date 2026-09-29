import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { boardPath, currentClassBoardSeason, recruitingWrites, type RecruitingResult } from '../../engine/college/state';
import type { MetaFile, RecruitingFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { commitDocs } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import { BoardTab } from './BoardTab';
import { ClassTab } from './ClassTab';
import { SetupPanel } from './SetupPanel';
import { useRecruitingState } from './useRecruitingState';
import '../pages/league.css';
import '../pages/roster.css';

/**
 * FBAJC recruiting (/league/fbajc/recruiting?class=): Create Class and the recruiting board of one class.
 * In calendar season n that is the class that plays this season (S{n}, board S{n-1}) or the next one (S{n+1}, board S{n}).
 * Without `?class=` the page opens on the current class when its board exists, else on the next class.
 */
export function RecruitingPage() {
  const [params, setParams] = useSearchParams();
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const asked = Number(params.get('class'));
  const askedValid = n !== undefined && (asked === n || asked === n + 1);
  // Only when `?class=` doesn't say, the default depends on whether the current class's board exists.
  const current = useDoc<RecruitingFile>(n === undefined || askedValid ? null : boardPath(currentClassBoardSeason(n)));
  let classOf: number | undefined;
  if (n !== undefined) {
    if (askedValid) classOf = asked;
    else if (current.data) classOf = n;
    else if (current.missing || current.error) classOf = n + 1;
  }
  const boardSeason = classOf === undefined ? undefined : classOf - 1;
  const load = useRecruitingState(boardSeason);
  const saving = useSaving();
  const path = boardSeason === undefined ? '' : boardPath(boardSeason);
  const autosave = useAutosaveDoc<RecruitingFile>(path, load.state?.recruiting, load.versions[path] ?? null);
  const [actionError, setActionError] = useState('');

  if (meta.error) return <p className="error">Couldn't load recruiting: {meta.error.message}</p>;
  if (load.error) return <p className="error">Couldn't load recruiting: {load.error.message}</p>;
  if (n === undefined || classOf === undefined || (!load.state && !load.setup)) return <p className="muted">Loading…</p>;
  const head = (
    <>
      <div className="league-head">
        <h1>FBAJC recruiting · Class of S{classOf}</h1>
        <label className="muted">
          Class{' '}
          <select aria-label="Class" value={classOf} onChange={e => setParams({ class: e.target.value })}>
            <option value={n}>S{n} class (plays S{n})</option>
            <option value={n + 1}>S{n + 1} class</option>
          </select>
        </label>
      </div>
      <LeagueTabs league="fbajc" />
    </>
  );
  if (!load.state) return <section>{head}<SetupPanel season={n} setup={load.setup!} versions={load.versions} /></section>;

  const recruiting = autosave.doc ?? load.state.recruiting;
  const state = { ...load.state, recruiting };
  const versions = { ...load.versions, [path]: autosave.version };
  const run = async (result: RecruitingResult) => {
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return;
    }
    setActionError('');
    try {
      await commitDocs(result.label, recruitingWrites(result), versions);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  // The class that plays this season was created last season: it only has a Board.
  const boardOnly = classOf === n;
  const wanted = params.get('tab');
  const tab = boardOnly ? 'board' : wanted === 'class' || wanted === 'board' ? wanted : recruiting.created ? 'board' : 'class';
  const tabLink = (id: 'board' | 'class', label: string) => (
    <Link role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' on' : ''}`} to={`/league/fbajc/recruiting?class=${classOf}&tab=${id}`}>{label}</Link>
  );

  return (
    <section>
      {head}
      <div className="tabs" role="tablist">{tabLink('board', 'Board')}{!boardOnly && tabLink('class', 'Class')}</div>
      {recruiting.locked && <p className="muted">Recruiting for this class is finished.</p>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {tab === 'class'
        ? <ClassTab state={state} saving={saving} onDraft={autosave.update} onRun={run} />
        : <BoardTab state={state} saving={saving} onRun={run} rng={Math.random} />}
    </section>
  );
}
