import { useEffect, useState, type ReactNode } from 'react';
import { BracketView } from './BracketView';
import type { Projection } from '../../engine/jc/bracketology';
import { revealPlan } from '../../engine/jc/reveal';
import type { JcPostseasonFile } from '../../engine/shared/types';

type Field = NonNullable<JcPostseasonFile['field']>;
const SPEED_MS = 900;

/**
 * The field shown the way Selection Sunday shows it: region by region and seed by seed, then the bubble lists, then the NIT.
 * `count` is how many steps are shown; `onCount` stores progress and `onDone` runs when the last step is shown.
 */
export function SelectionReveal({ field, p, teamCell, count, onCount }: {
  field: Field; p: Projection; teamCell: (id: string) => ReactNode; count: number; onCount: (n: number) => void;
}) {
  const plan = revealPlan(field);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (count >= plan.length) { setPlaying(false); return; }
    const t = setTimeout(() => onCount(count + 1), SPEED_MS);
    return () => clearTimeout(t);
  }, [playing, count, plan.length, onCount]);

  const shown = plan.slice(0, count);
  const [picked, setPicked] = useState<number | null>(null);
  const revealedSpots = new Set(shown.flatMap(s => (s.kind === 'spot' ? [s.id] : [])));
  const revealedNit = new Set(shown.flatMap(s => (s.kind === 'nit' ? [s.id] : [])));
  const sections = new Set(shown.flatMap(s => (s.kind === 'bubble' ? [s.section] : [])));
  const last = shown[shown.length - 1];
  // The bracket follows the reveal: the region being revealed is shown, unless a tab was picked since.
  const following = last && last.kind === 'spot' ? last.region : -2;
  const view = picked ?? following;
  // The real bracket with every team that has not been revealed yet left open (seeds stay).
  const spotOf = new Map(p.playIn.map(g => [g.teams[1], g.teams[0]] as const));
  const known = (id: string | null): boolean => id !== null && revealedSpots.has(spotOf.get(id) ?? id);
  const masked = {
    ...p.mm,
    games: p.mm.games.map(g => ({ ...g, home: known(g.home) ? g.home : null, away: known(g.away) ? g.away : null })),
  };
  const current = (id: string): string => (last && last.kind === 'nit' && last.id === id ? 'jc-reveal-now' : '');
  const groups: [string, Projection['power']][] = [['Power conferences', p.power], ['Other conferences', p.other]];

  return (
    <section aria-label="Selection Sunday">
      <div className="jc-actions jc-reveal-controls">
        <button className="btn primary" disabled={count >= plan.length} onClick={() => { setPlaying(false); setPicked(null); onCount(count + 1); }}>
          {count === 0 ? 'Start the reveal' : 'Next spot'}
        </button>
        <button className="btn" disabled={count >= plan.length} onClick={() => { setPicked(null); setPlaying(v => !v); }}>{playing ? 'Pause' : 'Play'}</button>
        <button className="btn" onClick={() => { setPlaying(false); onCount(plan.length); }}>Skip to the end</button>
        <span className="muted">{count} of {plan.length}</span>
      </div>
      <p className="muted">The field is set. Reveal it spot by spot, region by region, then the bubble and the NIT.</p>
      <h2>March Madness field</h2>
      <div className="jc-tabs">
        <button type="button" className="btn" aria-pressed={view === -2} onClick={() => setPicked(-2)}>First Four</button>
        {[0, 1, 2, 3].map(r => <button key={r} type="button" className="btn" aria-pressed={view === r} onClick={() => setPicked(r)}>Region {r + 1}</button>)}
        <button type="button" className="btn" aria-pressed={view === -1} onClick={() => setPicked(-1)}>Final Four</button>
      </div>
      <BracketView bracket={masked} teamCell={teamCell} empty={'—'}
        filter={g => (view === -2 ? g.round === 0 : view === -1 ? g.round >= 5 : g.region === view && g.round >= 1 && g.round < 5)} />
      {sections.has('in') && (
        <>
          <h2>First Four In</h2>
          <div className="jc-regions">
            {groups.map(([name, b]) => <div key={name} className="card jc-field"><h3>{name}</h3><ol>{b.firstFourIn.map(id => <li key={id}>{teamCell(id)}</li>)}</ol></div>)}
          </div>
        </>
      )}
      {sections.has('eight') && (
        <>
          <h2>Last Eight In</h2>
          <div className="jc-regions">
            {groups.flatMap(([name, b]) => [
              <div key={`${name} top`} className="card jc-field"><h3>{name}, 1-4</h3><ol>{b.lastEight.top.flatMap(g => g.teams).map(id => <li key={id}>{teamCell(id)}</li>)}</ol></div>,
              <div key={`${name} bottom`} className="card jc-field"><h3>{name}, 5-8</h3><ol start={5}>{b.lastEight.bottom.flatMap(g => g.teams).map(id => <li key={id}>{teamCell(id)}</li>)}</ol></div>,
            ])}
          </div>
        </>
      )}
      {sections.has('out') && (
        <>
          <h2>First Four Out</h2>
          <div className="jc-regions">
            {groups.map(([name, b]) => <div key={name} className="card jc-field"><h3>{name}</h3><ol>{b.firstFourOut.map(id => <li key={id}>{teamCell(id)}</li>)}</ol></div>)}
          </div>
        </>
      )}
      {revealedNit.size > 0 && (
        <>
          <h2>NIT field</h2>
          <div className="card jc-field">
            <ol>{field.nit.teams.filter(id => revealedNit.has(id)).map(id => <li key={id} className={current(id)}>{teamCell(id)}</li>)}</ol>
          </div>
        </>
      )}
    </section>
  );
}
