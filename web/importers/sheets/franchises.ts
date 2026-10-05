import type { FranchiseEra } from '../../engine/shared/types';

const RANGE = /^S(\d+)(?:-(?:S(\d+)|pres\.?))?$/i;

/**
 * One franchise tab of the team history sheet. Column A lists the franchise's name eras, newest first, each as
 * four cells: name, abbreviation, "(City, Region)", and "S41-S56", "S73-pres." or a single season "S11".
 */
export function parseFranchiseTab(rows: string[][]): { eras: FranchiseEra[]; problems: string[] } {
  const col = rows.map(r => (r?.[0] ?? '').trim());
  const eras: FranchiseEra[] = [];
  const problems: string[] = [];
  col.forEach((cell, i) => {
    const m = cell.match(RANGE);
    if (!m) return;
    const name = col[i - 3] ?? '';
    const abbr = col[i - 2] ?? '';
    const place = col[i - 1] ?? '';
    const city = /^\(.+\)$/.test(place) ? place.slice(1, -1).trim() : '';
    if (!name || !abbr || !city) {
      problems.push(`row ${i + 1}: era "${cell}" is missing its name, abbreviation or (city)`);
      return;
    }
    eras.push({ name, abbr, city, from: Number(m[1]), to: m[2] ? Number(m[2]) : /-/.test(cell) ? null : Number(m[1]) });
  });
  return { eras, problems };
}
