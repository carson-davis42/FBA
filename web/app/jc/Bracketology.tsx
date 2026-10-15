import { useMemo, useState, type ReactNode } from 'react';
import { projectBracket, type GroupBubble, type PlayInGame } from '../../engine/jc/bracketology';
import type { JcState } from '../../engine/jc/state';
import { BracketView } from './BracketView';

/** The projected March Madness bracket, derived from the latest ranking. Read-only; nothing is saved. */
export function Bracketology({ state, teamCell }: { state: JcState; teamCell: (id: string) => ReactNode }) {
  const p = useMemo(() => projectBracket(state), [state]);
  /** -2 the First Four, 0-3 a region, -1 the Final Four. */
  const [region, setRegion] = useState(-2);
  if (!p) return <p className="muted">There is no ranking yet. Bracketology appears once the first rankings are out.</p>;
  const champ = new Map(Object.values(p.champions).map(c => [c.teamId, c.projected]));
  const mark = (id: string): ReactNode => (champ.has(id)
    ? (champ.get(id) ? <span> *</span> : <span className="muted"> (conference champion)</span>) : null);
  /** A play-in spot holds its better team; the pair is shown together. */
  const playIn = new Map(p.playIn.map(g => [g.teams[0], g.teams] as const));
  const real = Object.values(p.champions).filter(c => !c.projected).length;
  const ranked = (games: PlayInGame[]) => games.flatMap(g => g.teams.map(id => (
    <li key={id}>{teamCell(id)}<span className="muted"> (seed {g.seed})</span></li>
  )));
  const groups: [string, GroupBubble][] = [['Power conferences', p.power], ['Other conferences', p.other]];
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
              {[...reg].sort((a, b) => p.seeds[a] - p.seeds[b]).map(id => {
                const pair = playIn.get(id);
                return pair
                  ? <li key={id}>{teamCell(pair[0])}{mark(pair[0])}<span className="muted"> / </span>{teamCell(pair[1])}{mark(pair[1])}</li>
                  : <li key={id}>{teamCell(id)}{mark(id)}</li>;
              })}
            </ol>
          </div>
        ))}
      </div>
      <h2>First Four In</h2>
      <p className="muted">The four best teams of each group that are safely in, just above the play-in games.</p>
      <div className="jc-regions">
        {groups.map(([name, b]) => (
          <div key={name} className="card jc-field">
            <h3>{name}</h3>
            <ol>{b.firstFourIn.map(id => <li key={id}>{teamCell(id)}<span className="muted"> (seed {p.seeds[id]})</span>{mark(id)}</li>)}</ol>
          </div>
        ))}
      </div>
      <h2>Last Eight In</h2>
      <p className="muted">The eight teams of each group that play the First Four, in ranking order. Pairs 1-2, 3-4, 5-6 and 7-8 play each other; the seed shown is the line the winner takes.</p>
      <div className="jc-regions">
        {groups.flatMap(([name, b]) => [
          <div key={`${name} top`} className="card jc-field"><h3>{name}, 1-4</h3><ol>{ranked(b.lastEight.top)}</ol></div>,
          <div key={`${name} bottom`} className="card jc-field"><h3>{name}, 5-8</h3><ol start={5}>{ranked(b.lastEight.bottom)}</ol></div>,
        ])}
      </div>
      <h2>First Four Out</h2>
      <div className="jc-regions">
        {groups.map(([name, b]) => (
          <div key={name} className="card jc-field">
            <h3>{name}</h3>
            <ol>{b.firstFourOut.map(id => <li key={id}>{teamCell(id)}</li>)}</ol>
          </div>
        ))}
      </div>
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
        <button type="button" className="btn" aria-pressed={region === -2} onClick={() => setRegion(-2)}>First Four</button>
        {[0, 1, 2, 3].map(r => <button key={r} type="button" className="btn" aria-pressed={region === r} onClick={() => setRegion(r)}>Region {r + 1}</button>)}
        <button type="button" className="btn" aria-pressed={region === -1} onClick={() => setRegion(-1)}>Final Four</button>
      </div>
      <BracketView bracket={p.mm} teamCell={teamCell} filter={g => (region === -2 ? g.round === 0 : region === -1 ? g.round >= 5 : g.region === region && g.round >= 1 && g.round < 5)} />
      <h2>NIT teams</h2>
      <div className="card jc-field">
        <ol>{p.nit.map(id => <li key={id}>{teamCell(id)}</li>)}</ol>
      </div>
    </section>
  );
}
