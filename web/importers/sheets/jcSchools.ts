import type { Report } from '../report';

/** One school's column of a conference tab of "FBA JC School History". Seasons are the college league's own numbers (S1-S18, then S48 on). */
export interface ParsedSchool {
  name: string;
  mm: { app: number[]; sweet16: number[]; elite8: number[]; final4: number[]; titleGame: number[]; champion: number[] };
  rsChampion: { season: number; conf: string | null }[];
  confTournament: { season: number; conf: string | null }[];
}

type Section = 'app' | 'sweet16' | 'elite8' | 'final4' | 'titleGame' | 'champion' | 'rsChampion' | 'confTournament';
const SECTIONS: Record<string, Section> = {
  'MM App.': 'app', 'Sweet 16': 'sweet16', 'Elite 8': 'elite8', 'Final Four': 'final4', 'NC app.': 'titleGame',
  'National Champions': 'champion', 'Conf RS Champions': 'rsChampion', 'Conf TOUR Champions': 'confTournament',
};
/** `(S11)`, `(S10)*` (the early era), `(S62)*A10` (the conference that season), and the source's `(S56*B10` typo with no closing parenthesis. */
const CELL = /^\(S(\d+)(\))?\s*(\*)?\s*([A-Za-z0-9]*)$/;

/**
 * Parses one conference tab: the school names across row 1 (columns B on), then eight sections stacked down the columns, each opened by a
 * `<label> | School-<count>` row and followed by `(S<n>)` cells. A header count that disagrees with its list is an error.
 */
export function parseSchoolTab(rows: string[][], report?: Report): ParsedSchool[] {
  const head = rows[0] ?? [];
  const cols = head.flatMap((h, j) => (j > 0 && (h ?? '').trim() ? [j] : []));
  const starts = rows.flatMap((r, i) => (SECTIONS[(r[0] ?? '').trim()] ? [i] : []));
  const out: ParsedSchool[] = cols.map(j => ({
    name: head[j].trim(),
    mm: { app: [], sweet16: [], elite8: [], final4: [], titleGame: [], champion: [] },
    rsChampion: [],
    confTournament: [],
  }));
  starts.forEach((start, k) => {
    const section = SECTIONS[rows[start][0].trim()];
    const label = rows[start][0].trim();
    const end = k + 1 < starts.length ? starts[k + 1] : rows.length;
    cols.forEach((j, idx) => {
      const school = out[idx];
      const header = (rows[start][j] ?? '').trim();
      const count = /^(.*)-(\d+)$/.exec(header);
      const seasons: { season: number; conf: string | null }[] = [];
      for (let x = start + 1; x < end; x++) {
        const text = (rows[x]?.[j] ?? '').trim();
        if (!text) continue;
        const m = CELL.exec(text);
        if (!m) { report?.error('jc-schools', `${school.name} ${label}: can't read "${text}"`); continue; }
        if (!m[2]) report?.warn('jc-schools', `${school.name} ${label}: "${text}" has no closing parenthesis (read as S${m[1]})`);
        const conf = m[4] || null;
        seasons.push({ season: Number(m[1]), conf });
      }
      if (!count) report?.error('jc-schools', `${school.name} ${label}: header "${header}" has no count`);
      else if (Number(count[2]) !== seasons.length) report?.error('jc-schools', `${school.name} ${label}: the header says ${count[2]} but ${seasons.length} season(s) are listed`);
      if (section === 'rsChampion' || section === 'confTournament') school[section] = seasons.sort((a, b) => a.season - b.season);
      else school.mm[section] = seasons.map(s => s.season).sort((a, b) => a - b);
    });
  });
  return out;
}
