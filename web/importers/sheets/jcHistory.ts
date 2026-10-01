import type { JcNationalAward } from '../../engine/shared/types';
import type { Report } from '../report';

/** Parsers for the FBAJC history workbook ("FBAJC"). Every cell is a trimmed string; `X` and blanks mean none. Seasons are the sheet's own numbers (S1–S18, then S48 on). */

const SEASON = /^S(\d+)$/;
const cell = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' || t.toUpperCase() === 'X' ? null : t;
};
const seasonOf = (v: string | undefined): number | null => {
  const m = SEASON.exec((v ?? '').trim());
  return m ? Number(m[1]) : null;
};

export interface JcChampionRow { season: number; champion: string; runnerUp: string | null; score: string | null; mvp: string | null }
export interface JcNitRow { season: number; champion: string; runnerUp: string | null; mvp: string | null }
export interface JcAwardRow { season: number; award: JcNationalAward; name: string; school: string | null }
export interface JcAaSlot { slot: string; name: string; school: string | null }
export interface JcAaSeason { season: number; teams: { team: number; slots: JcAaSlot[] }[] }
export interface JcConfAwardRow { season: number; conf: string; name: string; school: string | null }
export interface JcRsChampionRow { season: number; conf: string; school: string; record: string | null }
export interface JcConfTourRow { season: number; conf: string; school: string }
export interface JcPreseasonRow { season: number; event: string; champion: string }

/** "National Championship History": Year | Champion | Runner-Up | Score | C-Ship MVP | Date (a "JC Era" row precedes S1; the date is not used). */
export function parseNationalChampions(rows: string[][], report?: Report): JcChampionRow[] {
  const out: JcChampionRow[] = [];
  for (const r of rows) {
    const season = seasonOf(r[0]);
    if (season === null) continue;
    const champion = cell(r[1]);
    if (champion === null) { report?.warn('jc-history', `Skipped S${season}: no national champion`); continue; }
    out.push({ season, champion, runnerUp: cell(r[2]), score: cell(r[3]), mvp: cell(r[4]) });
  }
  return out;
}

/** "NIT Championship History": Year | Champion | Runner-Up | C-Ship MVP | Date. */
export function parseNitChampions(rows: string[][], report?: Report): JcNitRow[] {
  const out: JcNitRow[] = [];
  for (const r of rows) {
    const season = seasonOf(r[0]);
    if (season === null) continue;
    const champion = cell(r[1]);
    if (champion === null) { report?.warn('jc-history', `Skipped NIT S${season}: no champion`); continue; }
    out.push({ season, champion, runnerUp: cell(r[2]), mvp: cell(r[3]) });
  }
  return out;
}

const AWARD_TITLES: Record<string, JcNationalAward> = {
  'player of the year': 'POY', 'freshman of the year': 'FOY', 'guard of the year': 'GOY',
  'forward of the year': 'FWD', 'center of the year': 'COY', 'defensive poy': 'DPOY',
};
const isAaHeader = (r: string[]): boolean => (r[1] ?? '').trim().toLowerCase() === 'all-americans';

/** "FBAJC National Awards History", the six award blocks: a header row (column C = the title; column B on it is not a winner), then `S<n> | player | school`. Stops at the All-Americans row. */
export function parseNationalAwards(rows: string[][], report?: Report): JcAwardRow[] {
  const out: JcAwardRow[] = [];
  let award: JcNationalAward | null = null;
  for (const r of rows) {
    if (isAaHeader(r)) break;
    const season = seasonOf(r[0]);
    if (season === null) {
      const title = (r[2] ?? '').trim().toLowerCase();
      if (title) {
        award = AWARD_TITLES[title] ?? null;
        if (award === null) report?.warn('jc-history', `Unknown award block "${r[2]}"`);
      }
      continue;
    }
    const name = cell(r[1]);
    if (award === null || name === null) continue;
    out.push({ season, award, name, school: cell(r[2]) });
  }
  return out;
}

/** The "All-Americans" block of the same tab: `S<n>`, an optional `Team n` row (column B), then `slot | player | school` rows. A season with no team row is one team. */
export function parseAllAmericans(rows: string[][]): JcAaSeason[] {
  const start = rows.findIndex(isAaHeader);
  if (start < 0) return [];
  const out: JcAaSeason[] = [];
  let cur: JcAaSeason | null = null;
  for (const r of rows.slice(start + 1)) {
    const season = seasonOf(r[0]);
    if (season !== null) { cur = { season, teams: [] }; out.push(cur); continue; }
    if (!cur) continue;
    const team = /^Team\s+(\d+)$/i.exec((r[1] ?? '').trim());
    if (team && !(r[0] ?? '').trim()) { cur.teams.push({ team: Number(team[1]), slots: [] }); continue; }
    const slot = (r[0] ?? '').trim();
    const name = cell(r[1]);
    if (!slot || name === null) continue;
    if (!cur.teams.length) cur.teams.push({ team: 1, slots: [] });
    cur.teams[cur.teams.length - 1].slots.push({ slot, name, school: cell(r[2]) });
  }
  return out;
}

/** "Conference Awards History": a conference name every other column in row 1, then `S<n>` rows of player and school pairs. */
export function parseConferenceAwards(rows: string[][]): JcConfAwardRow[] {
  const head = rows[0] ?? [];
  const confs = head.flatMap((h, j) => (cell(h) ? [{ j, conf: h.trim() }] : []));
  const out: JcConfAwardRow[] = [];
  for (const r of rows.slice(1)) {
    const season = seasonOf(r[0]);
    if (season === null) continue;
    for (const { j, conf } of confs) {
      const name = cell(r[j]);
      if (name !== null) out.push({ season, conf, name, school: cell(r[j + 1]) });
    }
  }
  return out;
}

/** "Conference Regular Season Champ…": conference names across row 1; a season's first row is `School(W-L)` and the rows below (no season) list co-champions. */
export function parseRegularSeasonChampions(rows: string[][]): JcRsChampionRow[] {
  const head = rows[0] ?? [];
  const confs = head.flatMap((h, j) => (j > 0 && cell(h) ? [{ j, conf: h.trim() }] : []));
  const out: JcRsChampionRow[] = [];
  let season: number | null = null;
  for (const r of rows.slice(1)) {
    const s = seasonOf(r[0]);
    if (s !== null) season = s;
    if (season === null) continue;
    for (const { j, conf } of confs) {
      const text = cell(r[j]);
      if (text === null) continue;
      const m = /^(.*?)\s*\((\d+-\d+)\)$/.exec(text);
      out.push({ season, conf, school: m ? m[1].trim() : text, record: m ? m[2] : null });
    }
  }
  return out;
}

/** "Conference Tournament Champions": conference names across row 1, one school per `S<n>` row. */
export function parseTournamentChampions(rows: string[][]): JcConfTourRow[] {
  const head = rows[0] ?? [];
  const confs = head.flatMap((h, j) => (j > 0 && cell(h) ? [{ j, conf: h.trim() }] : []));
  const out: JcConfTourRow[] = [];
  for (const r of rows.slice(1)) {
    const season = seasonOf(r[0]);
    if (season === null) continue;
    for (const { j, conf } of confs) {
      const school = cell(r[j]);
      if (school !== null) out.push({ season, conf, school });
    }
  }
  return out;
}

/** "Preseason Tournament Champions": event names across row 1 (events are added over time), one school per `S<n>` row. */
export function parsePreseason(rows: string[][]): JcPreseasonRow[] {
  const head = rows[0] ?? [];
  const events = head.flatMap((h, j) => (j > 0 && cell(h) ? [{ j, event: h.trim() }] : []));
  const out: JcPreseasonRow[] = [];
  for (const r of rows.slice(1)) {
    const season = seasonOf(r[0]);
    if (season === null) continue;
    for (const { j, event } of events) {
      const champion = cell(r[j]);
      if (champion !== null) out.push({ season, event, champion });
    }
  }
  return out;
}
