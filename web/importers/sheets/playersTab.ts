export interface SheetPlayer { name: string; born: number | null }

/** Column A = name, column B = "Born-S61" (a season) or "Born-FFL S1(-53)" (before the sim; null). */
export function parsePlayersTab(rows: string[][]): SheetPlayer[] {
  const out: SheetPlayer[] = [];
  for (const row of rows) {
    const name = (row[0] ?? '').trim();
    if (!name) continue;
    const m = /^Born-S(\d+)\s*$/i.exec((row[1] ?? '').trim());
    out.push({ name, born: m ? Number(m[1]) : null });
  }
  return out;
}

const norm = (s: string): string => s.trim().replace(/’/g, "'").toLowerCase();

export const sameName = (a: string, b: string): boolean => norm(a) === norm(b);

/** Levenshtein distance between the normalised names. */
export function editDistance(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

/** Sheet names within edit distance 2 of `name` (none when `name` is in the sheet). */
export function closeMatches(name: string, sheet: SheetPlayer[]): SheetPlayer[] {
  if (sheet.some(s => sameName(s.name, name))) return [];
  const len = norm(name).length;
  // Names whose lengths differ by more than 2 can't be within distance 2.
  return sheet.filter(s => Math.abs(norm(s.name).length - len) <= 2 && editDistance(s.name, name) <= 2);
}
