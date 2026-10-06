import type { RelativesFile } from '../shared/types';

export interface Relative { playerId: string; /** How this player is related to the one asked about, such as "Cousin" or "Grandparent". */ label: string; /** Steps through the family tree: smaller is closer. */ distance: number }

const ORDINAL = ['', '', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
const great = (n: number) => 'great-'.repeat(Math.max(0, n));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** How a relative is related, from the generations each side is below their closest shared ancestor (`up` for the player asked about, `down` for the relative). */
function labelFor(up: number, down: number): string {
  if (up === 0) return cap(down === 1 ? 'child' : `${great(down - 2)}grandchild`);
  if (down === 0) return cap(up === 1 ? 'parent' : `${great(up - 2)}grandparent`);
  if (up === 1 && down === 1) return 'Sibling';
  if (up === 1) return cap(down === 2 ? 'nephew/niece' : `${great(down - 3)}grandnephew/grandniece`);
  if (down === 1) return cap(up === 2 ? 'uncle/aunt' : `${great(up - 2)}uncle/aunt`);
  const degree = Math.min(up, down) - 1;
  const cousin = degree === 1 ? 'Cousin' : `${ORDINAL[degree] ?? `${degree}th`} cousin`;
  const removed = Math.abs(up - down);
  return removed === 0 ? cousin : `${cousin}, ${removed === 1 ? 'once' : removed === 2 ? 'twice' : `${removed} times`} removed`;
}

/** Every ancestor of `id` (including itself at 0) with its number of generations up. */
function ancestors(parentsOf: Map<string, string[]>, id: string): Map<string, number> {
  const out = new Map<string, number>([[id, 0]]);
  let layer = [id];
  for (let d = 1; layer.length > 0; d++) {
    const next: string[] = [];
    for (const n of layer) for (const p of parentsOf.get(n) ?? []) if (!out.has(p)) { out.set(p, d); next.push(p); }
    layer = next;
  }
  return out;
}

/**
 * The listed players related to `playerId`, closest first. Everyone is placed in a tree of parent links (with unlisted stand-ins for relatives
 * who aren't players), and the relationship is read from how many generations each is below their closest shared ancestor.
 */
export function relativesOf(file: RelativesFile, playerId: string): Relative[] {
  const parentsOf = new Map<string, string[]>();
  const players = new Set<string>();
  for (const { child, parent } of file.parents) {
    parentsOf.set(child, [...(parentsOf.get(child) ?? []), parent]);
    for (const id of [child, parent]) if (id.startsWith('p')) players.add(id);
  }
  if (!players.has(playerId)) return [];
  const mine = ancestors(parentsOf, playerId);
  const out: Relative[] = [];
  for (const other of players) {
    if (other === playerId) continue;
    const theirs = ancestors(parentsOf, other);
    let best: { up: number; down: number } | null = null;
    for (const [id, up] of mine) {
      const down = theirs.get(id);
      if (down !== undefined && (best === null || up + down < best.up + best.down)) best = { up, down };
    }
    if (best) out.push({ playerId: other, label: labelFor(best.up, best.down), distance: best.up + best.down });
  }
  return out.sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label) || a.playerId.localeCompare(b.playerId));
}
