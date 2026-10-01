import type { Champion, JcSummary, PlayersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { nameResolver, normName } from './history';
import type { Report } from './report';
import type {
  JcAaSeason, JcAwardRow, JcChampionRow, JcConfAwardRow, JcConfTourRow, JcNitRow, JcPreseasonRow, JcRsChampionRow,
} from './sheets/jcHistory';

/** The last season an importer writes; S79 onward is written by the app. */
export const JC_LAST_SEASON = 78;

export interface JcParsed {
  champions: JcChampionRow[];
  nit: JcNitRow[];
  awards: JcAwardRow[];
  allAmericans: JcAaSeason[];
  confAwards: JcConfAwardRow[];
  rsChampions: JcRsChampionRow[];
  tourChampions: JcConfTourRow[];
  preseason: JcPreseasonRow[];
}
export interface JcHistoryCtx { players: PlayersFile; teams: TeamsFile; existing: Map<number, SummaryFile> }

/** The conference names the history workbook uses, mapped to the `teams.json` group codes (in sheet order). */
export const JC_CONF_CODES: [string, string][] = [
  ['Big 12', 'B12'], ['ACC', 'ACC'], ['Big East', 'BE'], ['SEC', 'SEC'], ['Big Ten', 'B10'], ['American', 'AAC'],
  ['PAC-12', 'P12'], ['Atlantic 10', 'A10'], ['Patriot', 'PAT'], ['Colonial', 'COL'], ['Horizon', 'HOR'], ['Ivy League', 'IVY'],
  ['Southern', 'SOCON'], ['Sun Belt', 'SUN'], ['Big Sky', 'SKY'], ['Mountain West', 'MWC'], ['Ohio Valley', 'OVC'], ['NEC', 'NEC'],
];
const CONF_BY_NAME = new Map(JC_CONF_CODES.map(([name, code]) => [normName(name), code]));
const CONF_ORDER = JC_CONF_CODES.map(([, code]) => code);

/** Sheet school spellings mapped to the `teams.json` spelling (keys and values compared with `normName`). */
export const SHEET_SCHOOL_ALIASES: Record<string, string> = { 'Abilene Christian': 'Abeline Christian' };
/** Sheet player spellings mapped to the `players.json` spelling (case is ignored by the matching itself). */
export const SHEET_PLAYER_ALIASES: Record<string, string> = { 'Eliott Miller': 'Elliott Miller', 'Kojo Battoe': 'Kojo Baffoe' };

const TITLE_NATIONAL = 'National Champion';
const TITLE_NIT = 'NIT Champion';
const OWN_TITLES = new Set([TITLE_NATIONAL, 'FBAJC National Champion', TITLE_NIT]);
const CURRENT_AA = ['G', 'F', 'C', 'ANY', 'ANY'];

const by = <T extends { season: number }>(rows: T[]): Map<number, T[]> => {
  const m = new Map<number, T[]>();
  for (const r of rows) m.set(r.season, [...(m.get(r.season) ?? []), r]);
  return m;
};

/**
 * Builds the FBAJC season summaries S1–S78 from the parsed history workbook, merging into the existing summaries (their other fields stay).
 * Teams are recorded by id (as the app does from S79) and fall back to the sheet's name when a school doesn't resolve; players link by id
 * when exactly one player matches and otherwise stay as the sheet's text. Never returns a season after S78.
 */
export function buildJcHistory(parsed: JcParsed, ctx: JcHistoryCtx, report: Report): SummaryFile[] {
  const teamIds = new Map(ctx.teams.teams.map(t => [normName(t.name), t.teamId]));
  const schoolCache = new Map<string, string | null>();
  const teamOf = (raw: string | null | undefined, where: string): string | null => {
    if (!raw) return null;
    const key = normName(raw);
    if (schoolCache.has(key)) return schoolCache.get(key)!;
    const name = SHEET_SCHOOL_ALIASES[raw] ?? raw;
    if (name !== raw) report.info('jc-teams', `Sheet school "${raw}" read as ${name}`);
    const id = teamIds.get(normName(name)) ?? null;
    if (id === null) report.warn('jc-teams', `Unmatched school "${raw}" (${where}); kept as text`);
    schoolCache.set(key, id);
    return id;
  };
  const resolve = nameResolver(ctx.players, report, 'jc-players');
  const playerCache = new Map<string, string | null>();
  const playerOf = (raw: string | null | undefined, where: string): string | null => {
    if (!raw) return null;
    const key = normName(raw);
    if (playerCache.has(key)) return playerCache.get(key)!;
    const name = SHEET_PLAYER_ALIASES[raw] ?? raw;
    if (name !== raw) report.info('jc-players', `Sheet player "${raw}" read as ${name}`);
    const id = resolve(name, where);
    playerCache.set(key, id);
    return id;
  };
  const confOf = (raw: string, where: string): string | null => {
    const code = CONF_BY_NAME.get(normName(raw)) ?? null;
    if (code === null) report.error('jc-conferences', `Unknown conference "${raw}" (${where})`);
    return code;
  };
  const idOrName = (raw: string, where: string): string => teamOf(raw, where) ?? raw;

  const champs = by(parsed.champions);
  const nits = by(parsed.nit);
  const awards = by(parsed.awards);
  const aas = by(parsed.allAmericans);
  const confAwards = by(parsed.confAwards);
  const rs = by(parsed.rsChampions);
  const tours = by(parsed.tourChampions);
  const pre = by(parsed.preseason);

  const all = new Set<number>();
  for (const m of [champs, nits, awards, aas, confAwards, rs, tours, pre]) for (const s of m.keys()) all.add(s);
  const seasons = [...all].sort((a, b) => a - b);
  for (const s of seasons.filter(s => s > JC_LAST_SEASON)) report.warn('jc-history', `Skipped S${s}: the app writes S${JC_LAST_SEASON + 1} and later`);

  const out: SummaryFile[] = [];
  for (const season of seasons.filter(s => s <= JC_LAST_SEASON)) {
    const where = `S${season}`;
    const nc = champs.get(season)?.[0];
    const nit = nits.get(season)?.[0];
    if (!nc) report.info('jc-history', `${where} has no national champion row`);

    const champion = (title: string, name: string, runnerUp: string | null, score: string | null, mvp: string | null): Champion => {
      const mvpId = playerOf(mvp, `${where} ${title} MVP`);
      const c: Champion = { title, champion: name, runnerUp, score };
      const id = teamOf(name, `${where} ${title}`);
      const rid = teamOf(runnerUp, `${where} ${title} runner-up`);
      if (id !== null) c.teamId = id;
      if (rid !== null) c.runnerUpId = rid;
      c.finalsMvp = mvpId;
      if (mvp && mvpId === null) c.mvpName = mvp;
      return c;
    };
    const built: Champion[] = [];
    if (nc) built.push(champion(TITLE_NATIONAL, nc.champion, nc.runnerUp, nc.score, nc.mvp));
    if (nit) built.push(champion(TITLE_NIT, nit.champion, nit.runnerUp, null, nit.mvp));

    const who = (name: string | null, school: string | null, w: string) => {
      const playerId = playerOf(name, w);
      const teamId = teamOf(school, w);
      return { playerId, teamId, ...(name ? { name } : {}), ...(school ? { school } : {}) };
    };

    const confCodes = new Set<string>();
    const tour = new Map<string, string>();
    for (const r of tours.get(season) ?? []) {
      const code = confOf(r.conf, where);
      if (code) { confCodes.add(code); tour.set(code, idOrName(r.school, `${where} ${r.conf} tournament`)); }
    }
    const rsBy = new Map<string, { school: string; record: string | null }[]>();
    for (const r of rs.get(season) ?? []) {
      const code = confOf(r.conf, where);
      if (!code) continue;
      confCodes.add(code);
      rsBy.set(code, [...(rsBy.get(code) ?? []), { school: idOrName(r.school, `${where} ${r.conf} regular season`), record: r.record }]);
    }
    const confChampions: JcSummary['confChampions'] = CONF_ORDER.filter(c => confCodes.has(c)).map(conf => {
      const list = rsBy.get(conf) ?? [];
      const entry: JcSummary['confChampions'][number] = { conf, tournament: tour.get(conf) ?? null, regularSeason: list.map(x => x.school) };
      if (list.some(x => x.record !== null)) entry.regularSeasonRecords = list.map(x => x.record);
      return entry;
    });

    const national: JcSummary['national'] = (awards.get(season) ?? []).map(a => ({ award: a.award, ...who(a.name, a.school, `${where} ${a.award}`) }));
    const conference: JcSummary['conference'] = [];
    for (const a of confAwards.get(season) ?? []) {
      const conf = confOf(a.conf, where);
      if (conf) conference.push({ conf, ...who(a.name, a.school, `${where} ${a.conf} award`) });
    }

    let allAmerican: JcSummary['allAmerican'] = null;
    let allAmericanLegacy: JcSummary['allAmericanLegacy'];
    const aa = aas.get(season)?.[0];
    if (aa) {
      const current = aa.teams.length === 3 && aa.teams.every((t, i) => t.team === i + 1 && t.slots.length === 5 && t.slots.every((s, k) => s.slot === CURRENT_AA[k]));
      if (current) {
        allAmerican = aa.teams.map(t => ({
          team: t.team as 1 | 2 | 3,
          slots: t.slots.map(s => ({ slot: s.slot as 'G' | 'F' | 'C' | 'ANY', ...who(s.name, s.school, `${where} All-American ${t.team}`) })),
        }));
      } else {
        allAmericanLegacy = {
          teams: aa.teams.map(t => ({
            team: t.team,
            slots: t.slots.map(s => ({ slot: s.slot, name: s.name, school: s.school, playerId: playerOf(s.name, `${where} All-American ${t.team}`), teamId: teamOf(s.school, `${where} All-American ${t.team}`) })),
          })),
        };
      }
    }

    const mvpMm = nc ? playerOf(nc.mvp, `${where} C-Ship MVP`) : null;
    const mvpNit = nit ? playerOf(nit.mvp, `${where} NIT MVP`) : null;
    const nameMm = nc?.mvp && mvpMm === null ? nc.mvp : null;
    const nameNit = nit?.mvp && mvpNit === null ? nit.mvp : null;

    const jc: JcSummary = {
      confChampions, national, conference, allAmerican,
      mvp: { mm: mvpMm, nit: mvpNit },
      nit: nit && nit.runnerUp ? { champion: idOrName(nit.champion, `${where} NIT`), runnerUp: idOrName(nit.runnerUp, `${where} NIT`) } : null,
    };
    if (allAmericanLegacy) jc.allAmericanLegacy = allAmericanLegacy;
    if (nameMm || nameNit) jc.mvpNames = { mm: nameMm, nit: nameNit };
    const preseason = (pre.get(season) ?? []).map(p => {
      const id = teamOf(p.champion, `${where} ${p.event}`);
      return { event: p.event, champion: p.champion, ...(id !== null ? { teamId: id } : {}) };
    });
    if (preseason.length) jc.preseason = preseason;

    const old = ctx.existing.get(season);
    const base: SummaryFile = old ?? { league: 'fbajc', season, locked: true, host: null, champions: [] };
    out.push({ ...base, locked: true, champions: [...built, ...base.champions.filter(c => !OWN_TITLES.has(c.title))], jc });
  }
  report.info('jc-history', `Built ${out.length} season(s); ${[...playerCache.values()].filter(Boolean).length} distinct players linked, ${[...playerCache.values()].filter(v => !v).length} kept as text; ${[...schoolCache.values()].filter(v => !v).length} school name(s) unmatched`);
  return out;
}
