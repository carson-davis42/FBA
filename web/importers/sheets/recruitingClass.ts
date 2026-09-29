import { Position } from '../../engine/shared/types';

/** One row of a class section in the FBA JC Recruiting tab. */
export interface ClassRow { rank: number; stars: 3 | 4 | 5; position: Position; name: string; r: number; school: string; consensus: number }

const cell = (row: string[], i: number): string => (row[i] ?? '').trim();
const isBlank = (row: string[]): boolean => row.every(c => (c ?? '').trim() === '');
const isHeader = (row: string[]): boolean => /^S\d+$/i.test(cell(row, 0));

function parseRow(row: string[], n: number): ClassRow {
  const bad = (why: string): never => { throw new Error(`FBA JC Recruiting tab, row ${n}: ${why}`); };
  const rank = Number(cell(row, 0));
  if (!Number.isInteger(rank) || rank < 1) bad(`rank "${cell(row, 0)}" isn't a number`);
  const stars = Number(/^(\d)\s*\*?$/.exec(cell(row, 1))?.[1]);
  if (stars !== 3 && stars !== 4 && stars !== 5) bad(`stars "${cell(row, 1)}" should be 3*, 4* or 5*`);
  const pos = Position.safeParse(cell(row, 2).toUpperCase());
  if (!pos.success) bad(`position "${cell(row, 2)}" isn't PG, SG, SF, PF or C`);
  const name = cell(row, 3);
  if (!name) bad('the name is empty');
  const r = Number(cell(row, 4));
  if (!cell(row, 4) || Number.isNaN(r)) bad(`R "${cell(row, 4)}" isn't a number`);
  const consensus = Number(cell(row, 6));
  if (!cell(row, 6) || Number.isNaN(consensus)) bad(`consensus "${cell(row, 6)}" isn't a number`);
  return { rank, stars: stars as 3 | 4 | 5, position: pos.data as Position, name, r, school: cell(row, 5), consensus };
}

/** The rows under the header row whose column A is `S${classOf}` (up to the next blank row or section header). Throws if there is no such header. */
export function parseClassSection(rows: string[][], classOf: number): ClassRow[] {
  const start = rows.findIndex(r => cell(r ?? [], 0).toUpperCase() === `S${classOf}`);
  if (start < 0) throw new Error(`No S${classOf} section in the FBA JC Recruiting tab`);
  const out: ClassRow[] = [];
  for (let i = start + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlank(row) || isHeader(row)) break;
    out.push(parseRow(row, i + 1));
  }
  return out;
}

export type SchoolCell = { kind: 'committed'; school: string } | { kind: 'projections'; count: number; codes: string[] };

/** "3 PROJ - UK, ARIZ, GU", "0 PROJ - none" or a school name (the recruit has committed). */
export function parseSchoolCell(text: string): SchoolCell {
  const m = /^(\d+)\s*PROJ\b\s*-?\s*(.*)$/i.exec(text.trim());
  if (!m) return { kind: 'committed', school: text.trim() };
  const codes = m[2].split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none');
  return { kind: 'projections', count: Number(m[1]), codes };
}
