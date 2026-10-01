export type PastGroup = 'AM' | 'EW' | 'EE' | 'ES' | 'PL' | 'WL' | 'UL' | 'IL';
export interface TeamLeagueRow { name: string; founded: number | null; spells: { group: PastGroup; from: number; to: number | null }[] }
export interface TitleRow { season: number; half: 1 | 2 | null; group: 'D2' | 'PL' | 'WL' | 'UL' | 'IL'; champion: string; runnerUp: string | null; seriesMvp: string | null }
export interface MvpCell { name: string; team: string }
export interface AwardsRow { season: number; half: 1 | 2 | null; mvps: { award: 'MVP-D2' | 'MVP-AM' | 'MVP-EW' | 'MVP-EE' | 'MVP-ES' | 'MVP-PL' | 'MVP-WL' | 'MVP-UL' | 'MVP-IL'; cell: MvpCell }[]; rsChampions: { group: PastGroup; teams: string[] }[] }
export interface D2DraftRow { team: string; name: string; pos: string; age: number | null; rating: number | null }

const blank = (s: string) => s === '' || s === 'X';
const cellAt = (row: string[], i: number) => row[i] ?? '';
const orNull = (s: string) => (blank(s) ? null : s);

export function parseSeasonCell(text: string): { season: number; half: 1 | 2 | null } | null {
  const m = /^S(\d+)(?:\((1|2)\))?$/.exec(text.trim());
  if (!m) return null;
  return { season: Number(m[1]), half: m[2] ? (Number(m[2]) as 1 | 2) : null };
}

export function parseMvpCell(text: string): MvpCell | null {
  if (blank(text)) return null;
  const m = /^(.*)-D2\((.*)\)$/.exec(text);
  if (!m) throw new Error(`MVP cell: can't read "${text}"`);
  return { name: m[1].trim(), team: m[2].trim() };
}

const GROUP_CODES: Record<string, PastGroup> = {
  'D2-America': 'AM', 'Euro-West': 'EW', 'Euro-East': 'EE', 'Euro-South': 'ES',
  'PL': 'PL', 'Premier League': 'PL', 'WL': 'WL', 'World League': 'WL',
  'UL': 'UL', 'United League': 'UL', 'IL': 'IL', 'International League': 'IL',
  'AM': 'AM', 'EW': 'EW', 'EE': 'EE', 'ES': 'ES',
};

export function pastGroupCode(text: string): PastGroup | null {
  return GROUP_CODES[text.trim()] ?? null;
}

const SECTION_HEADERS = new Set(['Premier League', 'World League', 'United League', 'International League']);

export function parseTeamLeagueHistory(rows: string[][]): TeamLeagueRow[] {
  const out: TeamLeagueRow[] = [];
  for (const row of rows) {
    const first = cellAt(row, 0);
    if (first === '' || SECTION_HEADERS.has(first)) continue;
    const name = first.replace(/\s*\((?:\+|-)\)$/, '').trim();
    let founded: number | null = null;
    const spells: TeamLeagueRow['spells'] = [];
    for (const cell of row.slice(1)) {
      if (cell === '') continue;
      const est = /^Est:\s*S(\d+)$/.exec(cell);
      if (est) { founded = Number(est[1]); continue; }
      const m = /^([^:]+):\s*S(\d+)(?:-(?:S(\d+)|pres\.))?$/.exec(cell);
      const group = m ? pastGroupCode(m[1]) : null;
      if (!m || !group) throw new Error(`Team League History: can't read "${cell}" (${name})`);
      const from = Number(m[2]);
      const to = m[3] !== undefined ? Number(m[3]) : /-pres\.$/.test(cell) ? null : from;
      spells.push({ group, from, to });
    }
    out.push({ name, founded, spells });
  }
  return out;
}

export function parseIntlChampionships(rows: string[][]): TitleRow[] {
  const out: TitleRow[] = [];
  for (const row of rows) {
    const s = parseSeasonCell(cellAt(row, 0));
    if (!s) continue;
    const champion = cellAt(row, 1);
    if (blank(champion)) continue;
    out.push({ ...s, group: 'D2', champion, runnerUp: orNull(cellAt(row, 2)), seriesMvp: orNull(cellAt(row, 3)) });
  }
  return out;
}

export function parseLeagueChampionships(rows: string[][]): TitleRow[] {
  const headerAt = rows.findIndex(r => cellAt(r, 0) === 'Year');
  if (headerAt < 0) return [];
  const blocks: { c: number; group: 'PL' | 'WL' | 'UL' | 'IL' }[] = [];
  rows[headerAt].forEach((h, c) => {
    const m = /^(PL|WL|UL|IL) Champion$/.exec(h);
    if (m) blocks.push({ c, group: m[1] as 'PL' | 'WL' | 'UL' | 'IL' });
  });
  const out: TitleRow[] = [];
  for (const row of rows.slice(headerAt + 1)) {
    const s = parseSeasonCell(cellAt(row, 0));
    if (!s) continue;
    for (const { c, group } of blocks) {
      const champion = cellAt(row, c);
      if (blank(champion)) continue;
      out.push({ ...s, group, champion, runnerUp: orNull(cellAt(row, c + 1)), seriesMvp: orNull(cellAt(row, c + 2)) });
    }
  }
  return out;
}

type MvpAward = AwardsRow['mvps'][number]['award'];

export function parseAwardsTab(rows: string[][]): AwardsRow[] {
  const headerAt = rows.findIndex(r => cellAt(r, 0) === 'Year');
  if (headerAt < 0) return [];
  const cols: { c: number; kind: 'mvp' | 'champ'; award?: MvpAward; group?: PastGroup }[] = [];
  rows[headerAt].forEach((h, c) => {
    if (h === 'D2 MVP') { cols.push({ c, kind: 'mvp', award: 'MVP-D2' }); return; }
    const mvp = /^(.+) MVP$/.exec(h);
    if (mvp) {
      const g = pastGroupCode(mvp[1]);
      if (g) cols.push({ c, kind: 'mvp', award: `MVP-${g}` as MvpAward });
      return;
    }
    const champ = /^(.+?) (?:RS )?Champions$/.exec(h);
    if (champ) {
      const g = pastGroupCode(champ[1]);
      if (g) cols.push({ c, kind: 'champ', group: g });
    }
  });
  const out: AwardsRow[] = [];
  for (const row of rows.slice(headerAt + 1)) {
    const s = parseSeasonCell(cellAt(row, 0));
    if (!s) continue;
    const mvps: AwardsRow['mvps'] = [];
    const rsChampions: AwardsRow['rsChampions'] = [];
    for (const col of cols) {
      const text = cellAt(row, col.c);
      if (col.kind === 'mvp') {
        const cell = parseMvpCell(text);
        if (cell) mvps.push({ award: col.award!, cell });
      } else if (!blank(text)) {
        rsChampions.push({ group: col.group!, teams: text.split('/').map(t => t.trim()).filter(t => t !== '') });
      }
    }
    out.push({ ...s, mvps, rsChampions });
  }
  return out;
}

export function d2DraftTabSeason(tab: string): number | null {
  const m = /^S(\d+) D2$/.exec(tab.trim());
  return m ? Number(m[1]) : null;
}

export function parseD2DraftTab(rows: string[][]): D2DraftRow[] {
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
  const out: D2DraftRow[] = [];
  for (const row of rows) {
    const team = cellAt(row, 0);
    if (team === '' || team.toUpperCase() === 'TEAM') continue;
    out.push({ team, name: cellAt(row, 1), pos: cellAt(row, 2), age: num(cellAt(row, 3)), rating: num(cellAt(row, 4)) });
  }
  return out;
}
