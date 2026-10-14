import type { ReactNode } from 'react';
import { idForName, uniqueNameIndex } from '../../engine/shared/playerNames';
import { PlayerName } from './PlayerName';

export { idForName, uniqueNameIndex };

/** A position then a name, as the roster moves write them: "PG-Gabriel Greenwood", ended by " (", ":" or the end of the line. */
const MOVE_NAME = /\b(PG|SG|SF|PF|C)-([^():→]+?)(?=\s*(?:\(|:|$))/g;

/** A saved transaction line with each player it names turned into a link to his profile (when the name is unambiguous). */
export function linkTransactionLine(line: string, index: Map<string, string>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(MOVE_NAME)) {
    const id = index.get(m[2].trim().toLowerCase());
    if (!id) continue;
    const start = m.index! + m[1].length + 1;
    out.push(line.slice(last, start), <PlayerName key={start} id={id} name={m[2].trim()} />);
    last = start + m[2].trim().length;
  }
  if (out.length === 0) return line;
  out.push(line.slice(last));
  return <>{out}</>;
}
