import { formatScore } from '../../engine/history/format';

export interface NameTeam { name: string; team: string | null }
export interface ChampRow { season: number; champion: string; runnerUp: string | null; score: string | null; finalsMvp: string | null }
export type AwardKey = 'MVP' | 'ROTY' | 'PPK' | 'LP' | 'MC' | 'DPOY' | 'MIP';
export interface AwardsRow {
  season: number;
  west: string | null;
  east: string | null;
  awards: Partial<Record<AwardKey, NameTeam>>;
  asgWinner: string | null;
  asgLoser: string | null;
  asgMvp: NameTeam | null;
  ysgWinner: string | null;
  ysgMvp: NameTeam | null;
  fivePoint: NameTeam | null;
  dunk: NameTeam | null;
}
export interface AllFbaSeason { season: number; slots: string[]; team1: (NameTeam | null)[]; team2: (NameTeam | null)[] }
export interface StandingRow { group: 'E' | 'W'; rank: number; name: string; w: number; l: number }
export interface BioRow { name: string; born: string; entries: string[] }

const TEAM_CODE = /^[A-Z][A-Za-z0-9]{0,4}$/;
const D2_TEAM = /^D2\(.+\)$/;
const SEASON_CELL = /^S(\d+)/;

/** A trimmed cell, or null for an empty cell or the sheet's "X" placeholder. */
function cell(row: string[] | undefined, i: number): string | null {
  const t = (row?.[i] ?? '').trim();
  return t === '' || t === 'X' ? null : t;
}

function seasonOf(row: string[] | undefined): number | null {
  const m = SEASON_CELL.exec((row?.[0] ?? '').trim());
  return m ? Number(m[1]) : null;
}

/** A series score cell: a date, an Excel serial (the sheet turned "4-1" into a date) or plain text. */
export function decodeScore(cellValue: string): string | null {
  const t = cellValue.trim();
  if (t === '' || t === 'X') return null;
  const iso = /^\d{4}-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${Number(iso[1])}–${Number(iso[2])}`;
  if (/^\d+(\.\d+)?$/.test(t) && Number(t) >= 20000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 864e5);
    return `${d.getUTCMonth() + 1}–${d.getUTCDate()}`;
  }
  return formatScore(t);
}

/** "Name-TEAM": split at the last hyphen; the right part is the team only when it looks like a team code. */
export function splitNameTeam(cellValue: string): NameTeam | null {
  const t = cellValue.trim();
  if (t === '' || t === 'X') return null;
  const i = t.lastIndexOf('-');
  if (i > 0) {
    const right = t.slice(i + 1).trim();
    if (TEAM_CODE.test(right) || D2_TEAM.test(right)) return { name: t.slice(0, i).trim(), team: right };
  }
  return { name: t, team: null };
}

const nameTeam = (row: string[] | undefined, i: number): NameTeam | null => {
  const c = cell(row, i);
  return c === null ? null : splitNameTeam(c);
};

/** The Championships tab: columns A, C, D, F, G; row 0 is the header. */
export function parseChampionships(rows: string[][]): ChampRow[] {
  const out: ChampRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const season = seasonOf(rows[i]);
    if (season === null) continue;
    const champion = cell(rows[i], 2);
    if (champion === null) continue;
    const score = cell(rows[i], 5);
    out.push({
      season,
      champion,
      runnerUp: cell(rows[i], 3),
      score: score === null ? null : decodeScore(score),
      finalsMvp: cell(rows[i], 6),
    });
  }
  return out;
}

const AWARD_HEADERS: [AwardKey, string][] = [
  ['MVP', 'MVP'], ['ROTY', 'ROTY'], ['PPK', 'PPK Award'], ['LP', 'LP Award'], ['MC', 'MC Award'], ['DPOY', 'DPOY'], ['MIP', 'MIP'],
];

/** The Awards tab: columns are found by the header text in row 0. */
export function parseAwards(rows: string[][]): AwardsRow[] {
  const header = (rows[0] ?? []).map(h => (h ?? '').trim());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Awards tab: no "${name}" column`);
    return i;
  };
  const wc = col('WC Champion');
  const ec = col('EC Champion');
  const awardCols = AWARD_HEADERS.map(([key, h]) => [key, col(h)] as const);
  const asgWinner = col('ASG Winner');
  const asgLoser = col('ASG Losing Captain');
  const asgMvp = col('ASG MVP');
  const ysg = col('YSG');
  const ysgMvp = col('YSG MVP');
  const five = col('5pt Contest');
  const dunk = col('Dunk Contest');

  const out: AwardsRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const season = seasonOf(rows[i]);
    if (season === null) continue;
    const r = rows[i];
    const awards: AwardsRow['awards'] = {};
    for (const [key, c] of awardCols) {
      const v = nameTeam(r, c);
      if (v) awards[key] = v;
    }
    out.push({
      season,
      west: cell(r, wc),
      east: cell(r, ec),
      awards,
      asgWinner: cell(r, asgWinner),
      asgLoser: cell(r, asgLoser),
      asgMvp: nameTeam(r, asgMvp),
      ysgWinner: cell(r, ysg),
      ysgMvp: nameTeam(r, ysgMvp),
      fivePoint: nameTeam(r, five),
      dunk: nameTeam(r, dunk),
    });
  }
  return out;
}

/** The All-FBA Teams tab: "S<n>" in column A starts a season, and the rows below it (column B = slot) fill it. */
export function parseAllFba(rows: string[][]): AllFbaSeason[] {
  const out: AllFbaSeason[] = [];
  let cur: AllFbaSeason | null = null;
  for (const r of rows) {
    const season = seasonOf(r);
    if (season !== null) {
      cur = { season, slots: [], team1: [], team2: [] };
      out.push(cur);
    } else if (cur && (r?.[0] ?? '').trim() === '' && (r?.[1] ?? '').trim() !== '') {
      cur.slots.push((r[1] ?? '').trim());
      cur.team1.push(nameTeam(r, 2));
      cur.team2.push(nameTeam(r, 3));
    }
  }
  return out;
}

const isNumber = (s: string | undefined): boolean => /^\d+(\.\d+)?$/.test((s ?? '').trim());
const num = (s: string | undefined): number => Math.round(Number((s ?? '').trim()));

/** One past-standings tab: East is columns B–E (rank, name, W, L), West is G–J. */
export function parsePastStandings(rows: string[][]): StandingRow[] {
  const out: StandingRow[] = [];
  for (const r of rows) {
    if (!isNumber(r?.[1])) continue;
    const groups: ['E' | 'W', number][] = [['E', 1], ['W', 6]];
    for (const [group, c] of groups) {
      const name = (r[c + 1] ?? '').trim();
      if (!isNumber(r[c]) || name === '') continue;
      out.push({ group, rank: num(r[c]), name, w: num(r[c + 2]), l: num(r[c + 3]) });
    }
  }
  return out;
}

/** The Players tab read as bios: column A name, column B born, columns C onward the career entries. */
export function parseBios(rows: string[][]): BioRow[] {
  const out: BioRow[] = [];
  for (const r of rows) {
    const name = (r?.[0] ?? '').trim();
    if (name === '') continue;
    out.push({
      name,
      born: (r[1] ?? '').trim(),
      entries: r.slice(2).map(e => (e ?? '').trim()).filter(e => e !== ''),
    });
  }
  return out;
}
