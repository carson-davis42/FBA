/** One recruit row of a class section of the "FBA JC Recruiting" tab. Early classes have no ratings ("X") and IN, MID or OUT instead of a position. */
export interface HistRecruitRow { rank: number; stars: number | null; pos: string; name: string; rating: number | null; school: string | null; consensus: number | null }
/** One row of a season section of the "FBA JC Transfer Portal" tab. */
export interface HistTransferRow { rank: number; pos: string; name: string; rating: number | null; from: string | null; to: string | null }
export interface ParsedSection<T> { season: number; rows: T[] }

const cell = (row: string[], i: number): string => (row[i] ?? '').trim();
const isBlank = (row: string[]): boolean => row.every(c => (c ?? '').trim() === '');
const header = (row: string[]): number | null => {
  const m = /^S(\d+)$/i.exec(cell(row, 0));
  return m ? Number(m[1]) : null;
};
const num = (text: string): number | null => {
  if (!text || /^x$/i.test(text)) return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
};

/** Splits a tab into its `S<n>` sections: the rows after a header up to the next blank row or header. Rows above the first header (the all-time list) are skipped. */
function sections(rows: string[][]): { season: number; rows: { row: string[]; line: number }[] }[] {
  const out: { season: number; rows: { row: string[]; line: number }[] }[] = [];
  let cur: (typeof out)[number] | null = null;
  rows.forEach((row, i) => {
    const r = row ?? [];
    const season = header(r);
    if (season !== null) { cur = { season, rows: [] }; out.push(cur); return; }
    if (isBlank(r)) { cur = null; return; }
    cur?.rows.push({ row: r, line: i + 1 });
  });
  return out;
}

const rankOf = (text: string, where: string): number => {
  const rank = Number(text);
  if (!Number.isInteger(rank) || rank < 1) throw new Error(`${where}: rank "${text}" isn't a number`);
  return rank;
};

/** The class sections of the FBA JC Recruiting tab: rank, stars, position, player, R, school, consensus. */
export function parseRecruitingHistory(rows: string[][]): ParsedSection<HistRecruitRow>[] {
  return sections(rows).map(sec => ({
    season: sec.season,
    rows: sec.rows.map(({ row, line }) => {
      const where = `FBA JC Recruiting tab, row ${line}`;
      const name = cell(row, 3);
      if (!name) throw new Error(`${where}: the name is empty`);
      const stars = /^(\d)\s*\*?$/.exec(cell(row, 1))?.[1];
      return { rank: rankOf(cell(row, 0), where), stars: stars ? Number(stars) : null, pos: cell(row, 2).toUpperCase(), name, rating: num(cell(row, 4)), school: cell(row, 5) || null, consensus: num(cell(row, 6)) };
    }),
  }));
}

/** The season sections of the FBA JC Transfer Portal tab: rank, position, player, old school, new school, rating. */
export function parseTransferHistory(rows: string[][]): ParsedSection<HistTransferRow>[] {
  return sections(rows).map(sec => ({
    season: sec.season,
    rows: sec.rows.map(({ row, line }) => {
      const where = `FBA JC Transfer Portal tab, row ${line}`;
      const name = cell(row, 2);
      if (!name) throw new Error(`${where}: the name is empty`);
      return { rank: rankOf(cell(row, 0), where), pos: cell(row, 1).toUpperCase(), name, rating: num(cell(row, 5)), from: cell(row, 3) || null, to: cell(row, 4) || null };
    }),
  }));
}
