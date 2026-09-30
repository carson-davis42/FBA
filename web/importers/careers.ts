import { careerAwardSums, parseBio, summaryAwardCounts } from '../engine/history/career';
import { AWARD_KEYS, type AwardCountsFile, type AwardKey, type PlayerBiosFile, type PlayersFile, type SummaryFile } from '../engine/shared/types';
import { nameResolver } from './history';
import type { Report } from './report';

export interface AwardsByPlayerRow { key: AwardKey; name: string; count: number }
export interface PpgRow { name: string; teamId: string; ppg: number }

const THROUGH_SEASON = 78;
const TAB11_HEADERS: Record<string, AwardKey> = {
  'MVP': 'MVP', 'ASG': 'ALL_STAR', 'ASG MVP': 'ASG_MVP', 'All-FBA T1': 'ALL_FBA_1', 'All-FBA T2': 'ALL_FBA_2',
  'PPK Award': 'PPK', 'LP Award': 'LP', 'MC Award': 'MC', 'DPOY': 'DPOY',
};
/** The keys tab 11 covers; the summaries give every other key for a player without a bio. */
const TAB11_KEYS: AwardKey[] = Object.values(TAB11_HEADERS);
/** The keys the summaries can check a bio against (S1-S78). */
const SUMMARY_CHECK_KEYS: AwardKey[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP', 'ALL_FBA_1', 'ALL_FBA_2', 'ASG_MVP', 'YSG_MVP', 'FINALS_MVP'];
/** Keys a bio never gives; they come from the summaries. */
const SUMMARY_ONLY_KEYS: AwardKey[] = ['FIVE_POINT', 'DUNK'];

/**
 * Tab 11: award columns at even indexes (`<Award>(S<n>)`), each followed by its counts column; rows are name and count
 * pairs. A row whose count isn't a whole number of at least 1 is skipped and added to `bad` as "<name> (<KEY>)".
 */
export function parseAwardsByPlayer(rows: string[][], bad: string[] = []): AwardsByPlayerRow[] {
  const header = rows[0] ?? [];
  const columns: { col: number; key: AwardKey }[] = [];
  for (let col = 0; col < header.length; col += 2) {
    const text = (header[col] ?? '').trim();
    if (text === '') continue;
    const key = TAB11_HEADERS[text.replace(/\s*\(S\d+\)$/, '').trim()];
    if (!key) throw new Error(`Awards by player tab: unknown column "${text}"`);
    columns.push({ col, key });
  }
  const out: AwardsByPlayerRow[] = [];
  for (const { col, key } of columns) {
    for (const r of rows.slice(1)) {
      const name = (r[col] ?? '').trim();
      if (name === '') continue;
      const text = (r[col + 1] ?? '').trim();
      const n = text === '' ? NaN : Math.round(Number(text));
      if (!Number.isFinite(n) || n < 1) { bad.push(`${name} (${key})`); continue; }
      out.push({ key, name, count: n });
    }
  }
  return out;
}

/** The S78 league points-per-game listing: `<rank>. <name>(<rating>)(<team>): <ppg>`. */
export function parseLeaguePpg(text: string): PpgRow[] {
  const out: PpgRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\d+\.\s+(.+)\((\d+)\)\(([^)]+)\):\s*([\d.]+)$/.exec(line.trim());
    if (m) out.push({ name: m[1].trim(), teamId: m[3].trim(), ppg: Number(m[4]) });
  }
  return out;
}

type Counts = Partial<Record<AwardKey, number>>;

export function buildCareers(
  input: { players: PlayersFile; bios: PlayerBiosFile; summaries: SummaryFile[]; tab11: AwardsByPlayerRow[]; ppg: PpgRow[] },
  report: Report,
): { awardCounts: AwardCountsFile; s78: SummaryFile | null } {
  const resolve = nameResolver(input.players, report, 'careers');
  const nameOf = (id: string): string => input.players.players[id]?.name ?? id;
  const info = (m: string) => report.info('careers', m);
  const warn = (m: string) => report.warn('careers', m);

  const tab11 = new Map<string, Counts>();
  for (const r of input.tab11) {
    const id = resolve(r.name, `tab 11 ${r.key}`);
    if (id === null) continue;
    const c = tab11.get(id) ?? {};
    c[r.key] = (c[r.key] ?? 0) + r.count;
    tab11.set(id, c);
  }
  const fromSummaries = summaryAwardCounts(input.summaries, 1, THROUGH_SEASON);

  const compare = (id: string, key: AwardKey, bio: number, other: number, source: string) => {
    if (bio === other) return;
    const message = `${nameOf(id)} ${key}: bio ${bio}, ${source} ${other}`;
    if (Math.abs(bio - other) >= 2 || Math.min(bio, other) === 0) warn(message);
    else info(message);
  };

  const result = new Map<string, Counts>();
  const unparsed = new Set<string>();
  const biographed = new Set<string>();
  // A stint team that looks like a team code but isn't in FBA_TEAMS: a new or relocated team would be classed as a college.
  const oddTeams = new Set<string>();
  for (const b of input.bios.bios) {
    biographed.add(b.playerId);
    const career = parseBio(b);
    for (const st of career.stints) if (st.kind === 'college' && /^[A-Z]{2,4}$/.test(st.team)) oddTeams.add(st.team);
    for (const text of career.other) unparsed.add(text);
    const sums = careerAwardSums(career);
    const t11 = tab11.get(b.playerId) ?? {};
    const sm = fromSummaries.get(b.playerId) ?? {};
    for (const key of TAB11_KEYS) compare(b.playerId, key, sums[key] ?? 0, t11[key] ?? 0, 'tab 11');
    for (const key of SUMMARY_CHECK_KEYS) compare(b.playerId, key, sums[key] ?? 0, sm[key] ?? 0, 'summaries');
    const own: Counts = { ...sums };
    for (const key of SUMMARY_ONLY_KEYS) if (sm[key]) own[key] = sm[key];
    result.set(b.playerId, own);
  }
  for (const id of new Set([...tab11.keys(), ...fromSummaries.keys()])) {
    if (biographed.has(id)) continue;
    const t11 = tab11.get(id) ?? {};
    const sm = fromSummaries.get(id) ?? {};
    const own: Counts = {};
    for (const key of AWARD_KEYS) {
      const n = TAB11_KEYS.includes(key) ? t11[key] : sm[key];
      if (n) own[key] = n;
    }
    result.set(id, own);
  }
  for (const text of unparsed) info(`Unparsed bio entry: ${text}`);
  for (const team of oddTeams) info(`Stint team treated as college: ${team}`);

  const counts: AwardCountsFile['counts'] = [];
  for (const id of [...result.keys()].sort()) {
    const own = result.get(id) as Counts;
    for (const key of AWARD_KEYS) {
      const count = own[key] ?? 0;
      if (count >= 1) counts.push({ playerId: id, key, count });
    }
  }

  const prior = input.summaries.find(s => s.league === 'fba' && s.season === THROUGH_SEASON);
  let s78: SummaryFile | null = null;
  if (prior) {
    const legacyPpg: NonNullable<SummaryFile['legacyPpg']> = [];
    for (const r of input.ppg) {
      const id = resolve(r.name, 'S78 PPG');
      if (id !== null) legacyPpg.push({ playerId: id, teamId: r.teamId, ppg: r.ppg });
    }
    s78 = { ...prior, legacyPpg };
  }
  const mine = report.entries.filter(e => e.topic === 'careers');
  info(`${mine.filter(e => e.level === 'info').length + 1} info, ${mine.filter(e => e.level === 'warn').length} warnings`);
  return { awardCounts: { league: 'fba', throughSeason: THROUGH_SEASON, counts }, s78 };
}
