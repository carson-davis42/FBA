import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { Dice } from '../../engine/shared/types';
import { SidesBug } from '../season/GameViews';

export interface RevealLine {
  group: string;
  text: string;
  /** The same line with player names as profile links; shown instead of `text` when present. */
  node?: ReactNode;
  dice?: Dice;
  /** Which scoreboard side this roll counts for, and how much. */
  side?: number;
  value?: number;
  /** Printed without its group header, because the text already says what it is. */
  bare?: boolean;
}

/** The card every event step sits in. */
export function StepCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card headed">
      <div className="card-head"><h3>{title}</h3></div>
      {children}
    </div>
  );
}

export function DiceFaces({ dice }: { dice: Dice }) {
  return <><span className="dice">{dice[0]}</span><span className="dice">{dice[1]}</span></>;
}

export function StaticLines({ lines }: { lines: RevealLine[] }) {
  return (
    <ul className="reveal-lines">
      {lines.map((l, i) => (
        <li key={i}>
          {(i === 0 || lines[i - 1].group !== l.group) && !l.bare && <strong>{l.group} · </strong>}
          {l.dice && <DiceFaces dice={l.dice} />} {l.node ?? l.text}
        </li>
      ))}
    </ul>
  );
}

/** Reveals pre-rolled lines one at a time, a group at a time, or all at once; calls onFinished once everything is shown. */
export function DiceReveal({ lines, sides, onFinished, busy }: { lines: RevealLine[]; sides?: string[]; onFinished: () => void; busy: boolean }) {
  const [shown, setShown] = useState(0);
  const finished = useRef(false);
  useEffect(() => {
    if (shown >= lines.length && !finished.current) {
      finished.current = true;
      onFinished();
    }
  }, [shown, lines.length, onFinished]);
  const done = shown >= lines.length;
  const groupEnd = () => {
    const g = lines[shown]?.group;
    let k = shown;
    while (k < lines.length && lines[k].group === g) k++;
    return k;
  };
  const totals = sides?.map((_, i) => lines.slice(0, shown).filter(l => l.side === i).reduce((a, l) => a + (l.value ?? 0), 0));
  return (
    <div>
      {sides && totals && <SidesBug sides={sides} totals={totals} />}
      <div className="sim-controls">
        <button className="btn" disabled={done || busy} onClick={() => setShown(s => s + 1)}>Roll next</button>
        <button className="btn" disabled={done || busy} onClick={() => setShown(groupEnd())}>Roll {lines[shown]?.group ?? 'group'}</button>
        <button className="btn primary" disabled={done || busy} onClick={() => setShown(lines.length)}>Roll to end</button>
      </div>
      <StaticLines lines={lines.slice(0, shown)} />
    </div>
  );
}
