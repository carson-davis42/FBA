import { useMemo, useState, type ReactNode } from 'react';
import { projectBracket, type GroupBubble } from '../../engine/jc/bracketology';
import type { JcState } from '../../engine/jc/state';
import { BracketView } from './BracketView';

/** The projected March Madness bracket, derived from the latest ranking. Read-only; nothing is saved. */
export function Bracketology({ state, teamCell }: { state: JcState; teamCell: (id: string) => ReactNode }) {
  const p = useMemo(() => projectBracket(state), [state]);
  const [region, setRegion] = useState(0);
  if (!p) return <p className="muted">There is no ranking yet. Bracketology appears once the first rankings are out.</p>;
  const champ = new Map(Object.values(p.champions).map(c => [c.teamId, c.projected]));
  const mark = (id: string): ReactNode => (champ.has(id)
    ? (champ.get(id) ? <span> *</span> : <span className="muted"> (conference champion)</span>) : null);
  const real = Object.values(p.champions).filter(c => !c.projected).length;
  const BubbleCards = ({ bubble }: { bubble: GroupBubble }) => (
    <div className="jc-regions">
      <div className="card jc-field">
        <h3>Last four in</h3>
        <ol>{bubble.firstFourIn.map(id => <li key={id}>{teamCell(id)}<span className="muted"> (seed {p.seeds[id]})</span>{mark(id)}</li>)}</ol>
      </div>
      <div className="card jc-field">
        <h3>First four out</h3>
        <ol>{bubble.firstFourOut.map(id => <li key={id}>{teamCell(id)}</li>)}</ol>
      </div>
    </div>
  );
  return (
    <section>
      <p className="muted">
        Projected with the same selection rules as the real fields, from the ranking after day {p.afterDay}.
        {' '}{real} of {Object.keys(p.champions).length} conference champions are decided; the rest are the best-ranked team in their conference.
      </p>
      {p.warnings.map(w => <p key={w} className="error">{w}</p>)}
      <h2>Projected bracket</h2>
      <p className="muted">* Projected conference champion: the best-ranked team in a conference whose tournament has not been played. The real champion replaces it once the tournament is finished.</p>
      <div className="jc-regions">
        {p.regions.map((reg, k) => (
          <div key={k} className="card jc-field">
            <h3>Region {k + 1}</h3>
            <ol>
              {[...reg].sort((a, b) => p.seeds[a] - p.seeds[b]).map(id => <li key={id}>{teamCell(id)}{mark(id)}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <h2>Bubble: power conferences</h2>
      <p className="muted">Power-conference teams fill no place after the 51st pick, so these are the last of them in and the first left out.</p>
      <BubbleCards bubble={p.power} />
      <h2>Bubble: other conferences</h2>
      <p className="muted">The last 13 places can only go to the other conferences.</p>
      <BubbleCards bubble={p.other} />
      <h2>Seed lines</h2>
      <div className="card jc-field">
        <ol>{p.seedLines.map((line, i) => (
          <li key={i}>{line.map((id, j) => <span key={id}>{j > 0 && ', '}{teamCell(id)}</span>)}</li>
        ))}</ol>
      </div>
      <h2>Bids by conference</h2>
      <div className="card jc-field">
        <ul>{p.bids.map(b => (
          <li key={b.conf}>{b.conf}: {b.count} {b.count === 1 ? 'bid' : 'bids'}</li>
        ))}</ul>
      </div>
      <h2>Bracket</h2>
      <div className="jc-tabs">
        {[0, 1, 2, 3].map(r => <button key={r} type="button" className="btn" aria-pressed={region === r} onClick={() => setRegion(r)}>Region {r + 1}</button>)}
        <button type="button" className="btn" aria-pressed={region === -1} onClick={() => setRegion(-1)}>Final Four</button>
      </div>
      <BracketView bracket={p.mm} teamCell={teamCell} filter={g => (region === -1 ? g.round >= 5 : g.region === region && g.round < 5)} />
      <h2>NIT teams</h2>
      <div className="card jc-field">
        <ol>{p.nit.map(id => <li key={id}>{teamCell(id)}</li>)}</ol>
      </div>
    </section>
  );
}
