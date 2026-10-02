import type { ReactNode } from 'react';
import type { PlayersFile } from '../../engine/shared/types';
import { PlayerName } from './PlayerName';

/** Player ids by lower-cased name; only names that belong to exactly one player are kept (the same rule the importers use). */
export function uniqueNameIndex(players: PlayersFile): Map<string, string> {
  const seen = new Map<string, string | null>();
  for (const p of Object.values(players.players)) {
    if (!p.name) continue;
    const key = p.name.trim().toLowerCase();
    seen.set(key, seen.has(key) ? null : p.id);
  }
  return new Map([...seen].filter((e): e is [string, string] => e[1] !== null));
}

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
