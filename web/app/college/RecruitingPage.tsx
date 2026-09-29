import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { recruitingDocPath, recruitingWrites, type RecruitingResult } from '../../engine/college/state';
import type { RecruitingFile } from '../../engine/shared/types';
import { useSaving } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { commitDocs } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import { BoardTab } from './BoardTab';
import { ClassTab } from './ClassTab';
import { SetupPanel } from './SetupPanel';
import { useRecruitingState } from './useRecruitingState';
import '../pages/league.css';
import '../pages/roster.css';

/** FBAJC recruiting (/league/fbajc/recruiting): Create Class and the recruiting board, for the class created this calendar season. */
export function RecruitingPage() {
  const load = useRecruitingState();
  const [params] = useSearchParams();
  const saving = useSaving();
  const path = load.season === undefined ? '' : recruitingDocPath('recruiting', load.season);
  const autosave = useAutosaveDoc<RecruitingFile>(path, load.state?.recruiting, load.versions[path] ?? null);
  const [actionError, setActionError] = useState('');

  if (load.error) return <p className="error">Couldn't load recruiting: {load.error.message}</p>;
  if (load.season === undefined || (!load.state && !load.setup)) return <p className="muted">Loading…</p>;
  const n = load.season;
  const head = (
    <>
      <div className="league-head">
        <h1>FBAJC recruiting</h1>
        <span className="muted">Class of S{n + 1}</span>
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
  const asked = params.get('tab');
  const tab = asked === 'class' || asked === 'board' ? asked : recruiting.created ? 'board' : 'class';
  const tabLink = (id: 'board' | 'class', label: string) => (
    <Link role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' on' : ''}`} to={`/league/fbajc/recruiting?tab=${id}`}>{label}</Link>
  );

  return (
    <section>
      {head}
      <div className="tabs" role="tablist">{tabLink('board', 'Board')}{tabLink('class', 'Class')}</div>
      {recruiting.locked && <p className="muted">Recruiting for this class is finished.</p>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {tab === 'class'
        ? <ClassTab state={state} saving={saving} onDraft={autosave.update} onRun={run} />
        : <BoardTab state={state} saving={saving} onRun={run} />}
    </section>
  );
}
