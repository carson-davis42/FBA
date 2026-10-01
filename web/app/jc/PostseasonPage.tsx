import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confDone, playAllConf, playConfRound, startConfTournaments } from '../../engine/jc/confTourney';
import { setFields, swapField } from '../../engine/jc/fieldMoves';
import { lineupOf } from '../../engine/jc/play';
import { nextPostGame, playPostRound, playPostToEnd, postseasonStage, recordPostGame, tournamentProblem, type PostStage, type PostTournament } from '../../engine/jc/postseason';
import type { JcState } from '../../engine/jc/state';
import { JC_PROFILE, simGame } from '../../engine/season/sim';
import { calendarProblem } from '../../engine/season/moves';
import type { Team } from '../../engine/shared/types';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { BracketView } from './BracketView';
import { jcGate } from './JcGate';
import { newRng, usePostseasonDocs } from './usePostseasonDocs';
import './jc.css';

type Tab = 'conference' | 'field' | 'nit' | 'mm';
const TABS: [Tab, string][] = [['conference', 'Conference tournaments'], ['field', 'Field'], ['nit', 'NIT'], ['mm', 'March Madness']];
const DEFAULT_TAB: Record<PostStage, Tab> = {
  regular: 'conference', conf: 'conference', fields: 'field', awards: 'field', nit: 'nit', mm: 'mm', allAmerican: 'mm', mvp: 'mm', finish: 'mm', done: 'mm',
};
const STAGE_TEXT: Record<PostStage, string> = {
  regular: 'Play all 29 days of the regular season first.',
  conf: 'Conference tournaments are next.',
  fields: 'Set the March Madness and NIT fields.',
  awards: 'Pick the season awards before the NIT starts.',
  nit: 'The NIT is next, then March Madness.',
  mm: 'March Madness is next.',
  allAmerican: 'Pick the All-American teams.',
  mvp: 'Pick the two tournament MVPs.',
  finish: 'Finish the season.',
  done: 'The season is finished.',
};

export function PostseasonPage() {
  const { season, docs, saving, error, run } = usePostseasonDocs();
  const [params, setParams] = useSearchParams();
  const [playing, setPlaying] = useState(false);
  const [conf, setConf] = useState<string | null>(null);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Postseason" /></section>;
  const gate = jcGate(docs, kicker, 'Postseason');
  if (gate) return <>{gate}</>;
  const state = docs.state!;
  const stage = postseasonStage(state);
  const tab = (TABS.find(([id]) => id === params.get('tab'))?.[0]) ?? DEFAULT_TAB[stage];
  const byId = new Map<string, Team>(state.teams.teams.map(t => [t.teamId, t]));
  const teamCell = (id: string): ReactNode => {
    const t = byId.get(id);
    return t ? <TeamName team={t} season={season} variant="abbr" to={`/league/fbajc/team/${id}`} /> : <span>{id}</span>;
  };
  const stepProblem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  const ps = state.postseason;
  const slow = (move: () => ReturnType<typeof playAllConf>): void => {
    setPlaying(true);
    setTimeout(() => { void run(move).finally(() => setPlaying(false)); }, 0);
  };
  const busy = saving || playing;

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={`S${season} FBAJC Postseason`} />
      <p className="muted">{STAGE_TEXT[stage]}{' '}
        {(stage === 'awards' || stage === 'allAmerican' || stage === 'mvp' || stage === 'finish') && <Link to="/league/fbajc/awards">Open the awards page</Link>}
      </p>
      <div className="jc-tabs" role="tablist" aria-label="Postseason sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className="btn" role="tab" aria-pressed={tab === id} aria-selected={tab === id} onClick={() => setParams({ tab: id })}>{label}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === 'conference' && (
        <section>
          <div className="jc-actions">
            {!ps ? (
              <button className="btn primary" disabled={busy || !!stepProblem || stage !== 'conf'} title={stage !== 'conf' ? STAGE_TEXT.regular : stepProblem ?? undefined}
                onClick={() => void run(() => startConfTournaments(state))}>Start conference tournaments</button>
            ) : (
              <>
                <button className="btn primary" disabled={busy || confDone(state) || !!stepProblem} onClick={() => void run(() => playConfRound(state, newRng()))}>Play round</button>
                <button className="btn" disabled={busy || confDone(state) || !!stepProblem} onClick={() => slow(() => playAllConf(state, newRng()))}>{playing ? 'Playing...' : 'Play all conference tournaments'}</button>
              </>
            )}
          </div>
          {ps && (
            <>
              <label className="jc-conf-pick">Conference{' '}
                <select value={conf ?? ps.conf[0].id} onChange={e => setConf(e.target.value)}>
                  {ps.conf.map(b => <option key={b.id} value={b.id}>{b.id}{b.champion ? ` (${byId.get(b.champion)?.abbr ?? b.champion})` : ''}</option>)}
                </select>
              </label>
              {(() => {
                const b = ps.conf.find(x => x.id === (conf ?? ps.conf[0].id))!;
                const rs = ps.rsChampions[b.id] ?? [];
                return (
                  <>
                    <p>Regular-season champion{rs.length > 1 ? 's' : ''}: {rs.map((id, i) => <span key={id}>{i > 0 && ', '}{teamCell(id)}</span>)}</p>
                    {b.champion && <p className="jc-banner">Tournament champion: {teamCell(b.champion)}</p>}
                    <BracketView bracket={b} teamCell={teamCell} hrefFor={g => (g.result ? { label: 'Box score', to: `/league/fbajc/game/${g.result.gameNo}` } : null)} />
                  </>
                );
              })()}
            </>
          )}
        </section>
      )}

      {tab === 'field' && <FieldPanel state={state} teamCell={teamCell} busy={busy} stepProblem={stepProblem} stage={stage} run={run} />}

      {(tab === 'nit' || tab === 'mm') && (
        <TournamentPanel which={tab} state={state} teamCell={teamCell} busy={busy} stage={stage} run={run} slow={slow} />
      )}
    </section>
  );
}

function FieldPanel({ state, teamCell, busy, stepProblem, stage, run }: {
  state: JcState; teamCell: (id: string) => ReactNode; busy: boolean; stepProblem: string | null; stage: PostStage; run: (b: () => ReturnType<typeof setFields>) => Promise<void>;
}) {
  const [which, setWhich] = useState<'mm' | 'nit'>('mm');
  const [out, setOut] = useState('');
  const [into, setInto] = useState('');
  const field = state.postseason?.field ?? null;
  const locked = !!state.postseason && ['nit', 'mm', 'allAmerican', 'mvp', 'finish', 'done'].includes(stage);
  const ready = !!state.postseason && confDone(state);
  const rs = new Set(Object.values(state.postseason?.rsChampions ?? {}).flat());
  const champs = new Set((state.postseason?.conf ?? []).map(b => b.champion));
  const nameOf = (id: string) => state.teams.teams.find(t => t.teamId === id)?.name ?? id;
  const inField = new Set([...(field?.mm.teams ?? []), ...(field?.nit.teams ?? [])]);
  const mine = field ? (which === 'mm' ? field.mm.teams : field.nit.teams) : [];
  const candidates = state.teams.teams.map(t => t.teamId).filter(id => !mine.includes(id));
  return (
    <section>
      <div className="jc-actions">
        <button className="btn primary" disabled={busy || !ready || locked || !!stepProblem} title={!ready ? 'Finish the conference tournaments first' : undefined}
          onClick={() => void run(() => setFields(state))}>{field ? 'Re-draw the fields' : 'Set the fields'}</button>
      </div>
      {!field ? <p className="muted">The fields are picked from the ranking after the conference tournaments.</p> : (
        <>
          {field.warnings.map(w => <p key={w} className="error">{w}</p>)}
          <h2>March Madness</h2>
          <div className="jc-regions">
            {field.mm.regions.map((region, k) => (
              <div key={k} className="card jc-field">
                <h3>Region {k + 1}</h3>
                <ol>
                  {region.map(id => <li key={id}>{field.mm.seeds[id]}. {teamCell(id)}{champs.has(id) && <span className="muted"> (conf. champion)</span>}</li>)}
                </ol>
              </div>
            ))}
          </div>
          <h2>NIT</h2>
          <div className="card jc-field">
            <ol>{field.nit.teams.map(id => <li key={id}>{teamCell(id)}{rs.has(id) && <span className="muted"> (regular-season champion)</span>}</li>)}</ol>
          </div>
          {!locked && (
            <div className="jc-actions">
              <label>Field{' '}
                <select aria-label="Field" value={which} onChange={e => { setWhich(e.target.value as 'mm' | 'nit'); setOut(''); }}>
                  <option value="mm">March Madness</option>
                  <option value="nit">NIT</option>
                </select>
              </label>
              <label>Remove{' '}
                <select aria-label="Remove" value={out} onChange={e => setOut(e.target.value)}>
                  <option value="">Pick a team</option>
                  {mine.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
                </select>
              </label>
              <label>Add{' '}
                <select aria-label="Add" value={into} onChange={e => setInto(e.target.value)}>
                  <option value="">Pick a team</option>
                  {candidates.map(id => <option key={id} value={id}>{nameOf(id)}{inField.has(id) ? ' (other field)' : ''}</option>)}
                </select>
              </label>
              <button className="btn" disabled={busy || !out || !into} onClick={() => void run(() => swapField(state, which, out, into))}>Swap</button>
            </div>
          )}
          {locked && <p className="muted">A tournament game has been played or the awards are locked in: the fields are final.</p>}
        </>
      )}
    </section>
  );
}

function TournamentPanel({ which, state, teamCell, busy, stage, run, slow }: {
  which: PostTournament; state: JcState; teamCell: (id: string) => ReactNode; busy: boolean; stage: PostStage;
  run: (b: () => ReturnType<typeof playPostRound>) => Promise<void>; slow: (m: () => ReturnType<typeof playAllConf>) => void;
}) {
  const b = state.postseason?.[which] ?? null;
  const label = which === 'nit' ? 'NIT' : 'March Madness';
  const [region, setRegion] = useState(0);
  if (!b) return <p className="muted">The fields have not been set yet.</p>;
  const reason = tournamentProblem(state, which);
  const next = nextPostGame(state, which);
  const playNext = (): void => {
    if (!next) return;
    void run(() => {
      const rng = newRng();
      const home = lineupOf(state.rosters.teams[next.home!], next.home!);
      const away = lineupOf(state.rosters.teams[next.away!], next.away!);
      if (typeof home === 'string') return { ok: false as const, problems: [home] };
      if (typeof away === 'string') return { ok: false as const, problems: [away] };
      return recordPostGame(state, which, simGame(state.postseason!.nextGameNo, home, away, rng, JC_PROFILE));
    });
  };
  const regions = which === 'mm' ? [0, 1, 2, 3] : [0, 1];
  return (
    <section>
      <div className="jc-actions">
        {next && !reason
          ? <Link className="btn primary" to={`/league/fbajc/game/${state.postseason!.nextGameNo}`}>Watch next game</Link>
          : <button className="btn primary" disabled title={reason ?? undefined}>Watch next game</button>}
        <button className="btn" disabled={busy || !!reason || !next} title={reason ?? undefined} onClick={playNext}>Sim next game</button>
        <button className="btn" disabled={busy || !!reason} title={reason ?? undefined} onClick={() => void run(() => playPostRound(state, which, newRng()))}>Play round</button>
        <button className="btn" disabled={busy || !!reason} title={reason ?? undefined} onClick={() => slow(() => playPostToEnd(state, which, newRng()))}>Play all of {label}</button>
      </div>
      {reason && stage !== 'done' && <p className="muted">{reason}</p>}
      {b.champion && <p className="jc-banner">{label} champion: {teamCell(b.champion)}</p>}
      <div className="jc-tabs">
        {regions.map(r => <button key={r} type="button" className="btn" aria-pressed={region === r} onClick={() => setRegion(r)}>Region {r + 1}</button>)}
        <button type="button" className="btn" aria-pressed={region === -1} onClick={() => setRegion(-1)}>{which === 'mm' ? 'Final Four' : 'Final'}</button>
      </div>
      <BracketView bracket={b} teamCell={teamCell}
        hrefFor={g => (g.result ? { label: 'Box score', to: `/league/fbajc/game/${g.result.gameNo}` }
          : next && !reason && g.id === next.id ? { label: 'Watch', to: `/league/fbajc/game/${state.postseason!.nextGameNo}` } : null)}
        filter={g => (region === -1 ? g.round >= 5 : g.region === region && g.round < 5)} />
    </section>
  );
}
