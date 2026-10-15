import { useEffect, useState, type ReactNode } from 'react';
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
  const revealedSpots = new Set(shown.flatMap(s => (s.kind === 'spot' ? [s.id] : [])));
  const revealedNit = new Set(shown.flatMap(s => (s.kind === 'nit' ? [s.id] : [])));
  const sections = new Set(shown.flatMap(s => (s.kind === 'bubble' ? [s.section] : [])));
  const last = shown[shown.length - 1];
  const playIn = new Map(p.playIn.map(g => [g.teams[0], g.teams] as const));
  const champ = new Map(Object.values(p.champions).map(c => [c.teamId, c.projected]));
  const mark = (id: string): ReactNode => (champ.has(id) ? <span className="muted"> (conference champion)</span> : null);
  const current = (id: string): string => (last && ((last.kind === 'spot' && last.id === id) || (last.kind === 'nit' && last.id === id)) ? 'jc-reveal-now' : '');
  const groups: [string, Projection['power']][] = [['Power conferences', p.power], ['Other conferences', p.other]];

  return (
    <section aria-label="Selection Sunday">
      <div className="jc-actions">
        <button className="btn primary" disabled={count >= plan.length} onClick={() => { setPlaying(false); onCount(count + 1); }}>
          {count === 0 ? 'Start the reveal' : 'Next spot'}
        </button>
        <button className="btn" disabled={count >= plan.length} onClick={() => setPlaying(v => !v)}>{playing ? 'Pause' : 'Play'}</button>
        <button className="btn" onClick={() => { setPlaying(false); onCount(plan.length); }}>Skip to the end</button>
        <span className="muted">{count} of {plan.length}</span>
      </div>
      <p className="muted">The field is set. Reveal it spot by spot, region by region, then the bubble and the NIT.</p>
      <h2>March Madness field</h2>
      <div className="jc-regions">
        {field.mm.regions.map((reg, k) => (
          <div key={k} className="card jc-field">
            <h3>Region {k + 1}</h3>
            <ol>
              {[...reg].sort((a, b) => field.mm.seeds[a] - field.mm.seeds[b]).map(id => {
                const pair = playIn.get(id);
                if (!revealedSpots.has(id)) return <li key={id} className="muted">&mdash;</li>;
                return pair
                  ? <li key={id} className={current(id)}>{teamCell(pair[0])}<span className="muted"> / </span>{teamCell(pair[1])}</li>
                  : <li key={id} className={current(id)}>{teamCell(id)}{mark(id)}</li>;
              })}
            </ol>
          </div>
        ))}
      </div>
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
