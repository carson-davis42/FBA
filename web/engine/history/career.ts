import { AWARD_KEYS, type AwardCountsFile, type AwardKey, type HallOfFameFile, type SummaryFile } from '../shared/types';

export type StintKind = 'college' | 'fba' | 'd2' | 'wc';
export interface Honour { label: string; count: number; seasons: number[] }
export interface Stint { kind: StintKind; team: string; range: string; from: number | null; to: number | 'pres' | null; honours: Honour[] }
/** `stints` are club and school teams only; `nationalTeams` are the World Cup call-ups, kept apart so they never interrupt a club run. */
export interface Career { stints: Stint[]; nationalTeams: Stint[]; hof: string | null; other: string[] }

const STINT = /^(.+?)\s*-\s*((?:S\d+|FFL|pres\.)(?:\s*-\s*(?:S\d+|FFL|pres\.))?(?:\s*;\s*(?:S\d+|FFL)(?:\s*-\s*(?:S\d+|FFL|pres\.))?)*)$/;
// Every FBA team code in the Players-tab bios. A shape rule can't be used: colleges such as Duke, UCLA and BYU look like team codes.
const FBA_TEAMS = new Set(['?', 'ATL', 'BOS', 'CAR', 'CGG', 'CHA', 'CHI', 'CIN', 'CP', 'CT', 'DCB', 'DEN', 'DET', 'FLO', 'FP', 'HON', 'LA',
  'MAN', 'MEM', 'MIL', 'MON', 'MW', 'NO', 'NY', 'OAK', 'OV', 'PHX', 'SAS', 'SEA', 'SOX', 'STL', 'TEX', 'TOR', 'USA', 'VAN', 'VEG']);

function kindOf(team: string): StintKind {
  if (team.startsWith('WC(')) return 'wc';
  if (team.startsWith('D2(')) return 'd2';
  if (team.split('/').every(p => FBA_TEAMS.has(p))) return 'fba';
  return 'college';
}

function seasonOf(token: string): number | null {
  const m = /^S(\d+)$/.exec(token);
  return m ? Number(m[1]) : null;
}

export function parseBio(bio: { born: string; entries: string[] }): Career {
  const career: Career = { stints: [], nationalTeams: [], hof: null, other: [] };
  for (const raw of bio.entries) {
    const entry = raw.trim();
    const hof = /^HOF-(S\d+|FFL)$/.exec(entry);
    if (hof) { career.hof = hof[1]; continue; }
    const stint = career.stints[career.stints.length - 1];
    const count = /^(\d+)x (.+)$/.exec(entry);
    const single = /^S(\d+) (.+)$/.exec(entry);
    if (count || single) {
      if (!stint) { career.other.push(entry); continue; }
      if (count) {
        stint.honours.push({ label: count[2].trim(), count: Number(count[1]), seasons: [] });
      } else if (single) {
        const label = single[2].trim();
        const season = Number(single[1]);
        const same = stint.honours.find(h => h.label.toLowerCase() === label.toLowerCase());
        if (same) { same.count += 1; same.seasons.push(season); }
        else stint.honours.push({ label, count: 1, seasons: [season] });
      }
      continue;
    }
    const m = STINT.exec(entry);
    if (m) {
      // "CT(W5-W6)-S58": the weeks of a mid-season stint are dropped, leaving the team code.
      const team = m[1].trim().replace(/\(W\d+(?:-W\d+)?\)$/i, '').trim();
      const range = m[2];
      const tokens = range.split(/[-;]/).map(t => t.trim());
      const first = tokens[0];
      const last = tokens[tokens.length - 1];
      career.stints.push({
        kind: kindOf(team), team, range,
        from: seasonOf(first),
        to: last === 'pres.' ? 'pres' : seasonOf(last),
        honours: [],
      });
      continue;
    }
    career.other.push(entry);
  }
  career.stints = mergeAcrossWorldCup(career.stints);
  career.nationalTeams = career.stints.filter(x => x.kind === 'wc');
  career.stints = career.stints.filter(x => x.kind !== 'wc');
  return career;
}

/** A World Cup call-up doesn't interrupt a player's team: "D2(BUD)-S78-pres.", "WC(HUN)-S78", "D2(BUD)-S79-pres." is one Budapest stint with the World Cup row after it. */
function mergeAcrossWorldCup(stints: Stint[]): Stint[] {
  const out: Stint[] = [];
  for (const s of stints) {
    if (s.kind === 'wc') { out.push(s); continue; }
    const base = [...out].reverse().find(o => o.kind !== 'wc');
    const gap = base && out.indexOf(base) < out.length - 1;
    const simple = (x: Stint) => x.from !== null && x.to !== null && !x.range.includes(';');
    if (base && gap && base.kind === s.kind && base.team === s.team && simple(base) && simple(s)
      && (base.to === 'pres' || (s.from as number) <= (base.to as number) + 1)) {
      base.to = s.to;
      base.range = s.to === 'pres' ? `S${base.from}-pres.` : base.from === s.to ? `S${base.from}` : `S${base.from}-S${s.to}`;
      base.honours.push(...s.honours);
      continue;
    }
    out.push(s);
  }
  return out;
}

const LABEL_KEYS: Record<string, AwardKey> = {
  'mvp': 'MVP',
  'roty': 'ROTY',
  'ppk award': 'PPK',
  'lp award': 'LP',
  'mc award': 'MC',
  'dpoy': 'DPOY',
  'mip': 'MIP',
  'all-fba t1': 'ALL_FBA_1',
  'all-fba t2': 'ALL_FBA_2',
  'all-star': 'ALL_STAR',
  'young-star': 'YOUNG_STAR',
  'asg mvp': 'ASG_MVP',
  'ysg mvp': 'YSG_MVP',
  'fba c-ship mvp': 'FINALS_MVP',
  'fba champion': 'CHAMPION',
  'fba c-ship app.': 'CSHIP_APP',
  'ec champion': 'CONF_CHAMPION',
  'wc champion': 'CONF_CHAMPION',
};

export function bioAwardKey(label: string): AwardKey | null {
  return LABEL_KEYS[label.trim().toLowerCase()] ?? null;
}

export function careerAwardSums(career: Career): Partial<Record<AwardKey, number>> {
  const sums: Partial<Record<AwardKey, number>> = {};
  for (const stint of career.stints) {
    if (stint.kind !== 'fba') continue;
    for (const h of stint.honours) {
      const key = bioAwardKey(h.label);
      if (key) sums[key] = (sums[key] ?? 0) + h.count;
    }
  }
  return sums;
}

// ---- Live careers (S79 and later), from the summaries ----

const KEY_LABEL: Partial<Record<AwardKey, string>> = {
  MVP: 'MVP', ROTY: 'ROTY', PPK: 'PPK Award', LP: 'LP Award', MC: 'MC Award', DPOY: 'DPOY', MIP: 'MIP',
  ALL_FBA_1: 'All-FBA T1', ALL_FBA_2: 'All-FBA T2', ALL_STAR: 'All-Star', YOUNG_STAR: 'Young-Star',
  ASG_MVP: 'ASG MVP', YSG_MVP: 'YSG MVP', FINALS_MVP: 'FBA C-Ship MVP', CHAMPION: 'FBA Champion', CSHIP_APP: 'FBA C-Ship app.',
};
const SINGLE_SEASON: ReadonlySet<AwardKey> = new Set<AwardKey>(['ROTY', 'MIP']);
const isAwardKey = (s: string): s is AwardKey => (AWARD_KEYS as readonly string[]).includes(s);

interface HonourEvent { playerId: string; key: AwardKey; teamId: string | null; conf?: 'E' | 'W' }

/** Every honour a finished FBA season gives out. `teamId` is the team it belongs to, when the summary says. */
function honourEvents(s: SummaryFile): HonourEvent[] {
  const out: HonourEvent[] = [];
  const add = (playerId: string | null | undefined, key: AwardKey, teamId: string | null = null, conf?: 'E' | 'W') => {
    if (playerId) out.push({ playerId, key, teamId, conf });
  };
  for (const a of s.awards ?? []) if (isAwardKey(a.award)) add(a.playerId, a.award, a.teamId);
  for (const slot of s.allFba?.team1 ?? []) add(slot.playerId, 'ALL_FBA_1', slot.teamId);
  for (const slot of s.allFba?.team2 ?? []) add(slot.playerId, 'ALL_FBA_2', slot.teamId);
  const st = s.allStar;
  if (st) {
    for (const id of st.allStars) add(id, 'ALL_STAR');
    for (const id of st.youngStars) add(id, 'YOUNG_STAR');
    add(st.asgMvp, 'ASG_MVP');
    add(st.ysgMvp, 'YSG_MVP');
    add(st.fivePoint, 'FIVE_POINT');
    add(st.dunk, 'DUNK');
  }
  const champ = s.champions.find(c => c.title === 'FBA Champion');
  add(champ?.finalsMvp, 'FINALS_MVP', champ?.teamId ?? null);
  const teamsOf = new Map<string, string[]>();
  for (const l of s.players ?? []) {
    if (l.teamId === null) continue;
    const teams = teamsOf.get(l.playerId) ?? [];
    if (!teams.includes(l.teamId)) teams.push(l.teamId);
    teamsOf.set(l.playerId, teams);
  }
  const confWinners = (s.bracket?.series ?? []).filter(x => (x.id === 'E-CF' || x.id === 'W-CF') && x.winner)
    .map(x => ({ teamId: x.winner as string, conf: x.id === 'E-CF' ? 'E' as const : 'W' as const }));
  for (const [playerId, teams] of teamsOf) {
    if (champ?.teamId && teams.includes(champ.teamId)) add(playerId, 'CHAMPION', champ.teamId);
    const finalist = [champ?.teamId, champ?.runnerUpId].find(t => t && teams.includes(t));
    if (finalist) add(playerId, 'CSHIP_APP', finalist);
    for (const w of confWinners) if (teams.includes(w.teamId)) add(playerId, 'CONF_CHAMPION', w.teamId, w.conf);
  }
  return out;
}

const fbaSummaries = (summaries: SummaryFile[]) => summaries.filter(s => s.league === 'fba').sort((a, b) => a.season - b.season);

export function summaryAwardCounts(summaries: SummaryFile[], from: number, to: number): Map<string, Partial<Record<AwardKey, number>>> {
  const out = new Map<string, Partial<Record<AwardKey, number>>>();
  for (const s of fbaSummaries(summaries)) {
    if (s.season < from || s.season > to) continue;
    for (const e of honourEvents(s)) {
      const counts = out.get(e.playerId) ?? {};
      counts[e.key] = (counts[e.key] ?? 0) + 1;
      out.set(e.playerId, counts);
    }
  }
  return out;
}

function setRange(stint: Stint) {
  if (stint.from === null) return;
  stint.range = stint.to === stint.from ? `S${stint.from}` : `S${stint.from}-S${stint.to}`;
}

function addHonour(stint: Stint, e: HonourEvent, season: number) {
  const label = e.key === 'CONF_CHAMPION' ? (e.conf === 'E' ? 'EC Champion' : 'WC Champion') : KEY_LABEL[e.key];
  if (!label) return;
  const same = stint.honours.find(h => h.label.toLowerCase() === label.toLowerCase());
  if (SINGLE_SEASON.has(e.key)) {
    if (same) { same.count += 1; same.seasons.push(season); }
    else stint.honours.push({ label, count: 1, seasons: [season] });
  } else if (same) same.count += 1;
  else stint.honours.push({ label, count: 1, seasons: [] });
}

export function liveCareer(bio: { born: string; entries: string[] } | null, playerId: string, summaries: SummaryFile[], hof: HallOfFameFile | null): Career {
  const career: Career = bio ? parseBio(bio) : { stints: [], nationalTeams: [], hof: null, other: [] };
  const lastFba = (): Stint | undefined => [...career.stints].reverse().find(s => s.kind === 'fba');
  for (const s of fbaSummaries(summaries)) {
    if (s.season < 79) continue;
    const lines = (s.players ?? []).filter(l => l.playerId === playerId && l.teamId !== null && l.stint !== null)
      .sort((a, b) => (a.stint as number) - (b.stint as number));
    const held = new Map<string, Stint>();
    let last: Stint | undefined;
    for (const line of lines) {
      const team = line.teamId as string;
      let stint = lastFba();
      const open = stint && (stint.to === 'pres' || (typeof stint.to === 'number' && stint.to >= s.season - 1));
      if (stint && stint.team === team && open) {
        stint.from ??= s.season;
        stint.to = s.season;
      } else {
        if (stint && stint.to === 'pres') { stint.to = 78; setRange(stint); }
        stint = { kind: 'fba', team, range: '', from: s.season, to: s.season, honours: [] };
        career.stints.push(stint);
      }
      setRange(stint);
      held.set(team, stint);
      last = stint;
    }
    for (const e of honourEvents(s)) {
      if (e.playerId !== playerId) continue;
      const stint = (e.teamId ? held.get(e.teamId) : undefined) ?? last ?? lastFba();
      if (stint) addHonour(stint, e, s.season);
    }
  }
  career.hof ??= hof?.classes.find(c => c.inductees.some(i => i.playerId === playerId))?.season ?? null;
  return career;
}

export function careerLines(career: Career): string[] {
  const out: string[] = [];
  for (const s of career.stints) {
    if (s.kind !== 'college' && s.kind !== 'fba') continue;
    const range = s.to === 'pres' ? `S${s.from}-S78` : s.range;
    out.push(`${s.team}: ${range}`);
  }
  type Item = { text: string } | { key: string; label: string; count: number };
  const items: Item[] = [];
  for (const s of career.stints) {
    if (s.kind !== 'fba') continue;
    for (const h of s.honours) {
      if (h.seasons.length > 0) {
        for (const n of h.seasons) items.push({ text: `S${n} ${h.label}` });
        continue;
      }
      const label = /^(EC|WC) Champion$/i.test(h.label) ? 'Conference Champion' : h.label;
      const key = label.toLowerCase();
      const same = items.find((i): i is { key: string; label: string; count: number } => 'key' in i && i.key === key);
      if (same) same.count += h.count;
      else items.push({ key, label, count: h.count });
    }
  }
  for (const i of items) out.push('text' in i ? i.text : `${i.count}x ${i.label}`);
  return out;
}

const emptyTotals = (): Record<AwardKey, number> => Object.fromEntries(AWARD_KEYS.map(k => [k, 0])) as Record<AwardKey, number>;

/** Every player's award totals: the baseline counts plus the summaries after its season. One pass over the summaries. */
export function awardTotalsAll(baseline: AwardCountsFile | null, summaries: SummaryFile[]): Map<string, Record<AwardKey, number>> {
  const out = new Map<string, Record<AwardKey, number>>();
  const of = (id: string) => {
    let t = out.get(id);
    if (!t) { t = emptyTotals(); out.set(id, t); }
    return t;
  };
  for (const c of baseline?.counts ?? []) of(c.playerId)[c.key] += c.count;
  for (const [id, live] of summaryAwardCounts(summaries, (baseline?.throughSeason ?? 0) + 1, 9999)) {
    const t = of(id);
    for (const k of AWARD_KEYS) t[k] += live[k] ?? 0;
  }
  return out;
}

export function awardTotals(playerId: string, baseline: AwardCountsFile | null, summaries: SummaryFile[]): Record<AwardKey, number> {
  return awardTotalsAll(baseline, summaries).get(playerId) ?? emptyTotals();
}

/** `ppg` is null for a line with no games played. */
export interface StatRow { season: number; teamId: string | null; gp: number | null; pts: number | null; ppg: number | null; po: { gp: number; pts: number; ppg: number | null } | null }

const round1 = (x: number) => Math.round(x * 10) / 10;
const perGame = (pts: number, gp: number): number | null => (gp > 0 ? round1(pts / gp) : null);

export function careerStats(playerId: string, summaries: SummaryFile[]): { rows: StatRow[]; total: { gp: number; pts: number; ppg: number } } {
  const rows: StatRow[] = [];
  const fba = fbaSummaries(summaries);
  for (const s of fba) {
    if (s.season !== 78) continue;
    for (const p of s.legacyPpg ?? []) if (p.playerId === playerId) rows.push({ season: 78, teamId: p.teamId, gp: null, pts: null, ppg: p.ppg, po: null });
  }
  let gp = 0;
  let pts = 0;
  for (const s of fba) {
    if (s.season < 79) continue;
    const lines = (s.players ?? []).filter(l => l.playerId === playerId && l.teamId !== null && l.stint !== null)
      .sort((a, b) => (a.stint as number) - (b.stint as number));
    for (const l of lines) {
      rows.push({
        season: s.season, teamId: l.teamId, gp: l.rs.g, pts: l.rs.pts, ppg: perGame(l.rs.pts, l.rs.g),
        po: l.po ? { gp: l.po.g, pts: l.po.pts, ppg: perGame(l.po.pts, l.po.g) } : null,
      });
      gp += l.rs.g;
      pts += l.rs.pts;
    }
  }
  return { rows, total: { gp, pts, ppg: perGame(pts, gp) ?? 0 } };
}

/** Games and points since S79 for every player, in one pass; the same lines `careerStats` totals. */
export function careerTotalsAll(summaries: SummaryFile[]): Map<string, { gp: number; pts: number }> {
  const out = new Map<string, { gp: number; pts: number }>();
  for (const s of fbaSummaries(summaries)) {
    if (s.season < 79) continue;
    for (const l of s.players ?? []) {
      if (l.teamId === null || l.stint === null) continue;
      const t = out.get(l.playerId) ?? { gp: 0, pts: 0 };
      t.gp += l.rs.g;
      t.pts += l.rs.pts;
      out.set(l.playerId, t);
    }
  }
  return out;
}

/** The first and last season a career covers (college years included): `to` is "pres" for a stint still running. Null when no stint has a season. */
export function careerSpan(career: Career): { from: number; to: number | 'pres' | null } | null {
  const seasons = career.stints.flatMap(s => (s.from !== null ? [s.from] : []));
  if (seasons.length === 0) return null;
  const last = [...career.stints].reverse().find(s => s.to !== null);
  const numeric = career.stints.flatMap(s => (typeof s.to === 'number' ? [s.to] : []));
  return { from: Math.min(...seasons), to: last ? last.to : numeric.length ? Math.max(...numeric) : null };
}

export type PlayerStatus = 'hof' | 'retired' | StintKind | 'unknown';

/**
 * Where a player is now: in the Hall of Fame, retired (the app recorded his retirement, or his last pro stint ended before the latest season),
 * or playing in the league of his last stint (FBA, D2, college or World Cup).
 */
export function playerStatus(career: Career, retired: boolean, latestSeason: number): PlayerStatus {
  if (career.hof !== null) return 'hof';
  if (retired) return 'retired';
  const last = career.stints[career.stints.length - 1] ?? career.nationalTeams[career.nationalTeams.length - 1];
  if (!last) return 'unknown';
  if (last.kind !== 'college' && typeof last.to === 'number' && last.to < latestSeason) return 'retired';
  return last.kind;
}

/** Where a player is on the live rosters right now: an FBA team code, a D2 team as "D2(Name)", or a school name. */
export interface Placement { kind: 'fba' | 'd2' | 'college'; team: string }

/**
 * Brings a career up to date with the live rosters, which move before any season summary exists (a signing in the offseason, a trade, a draft pick).
 * The stint he is in stays open ("pres"); when he is somewhere else the open stint ends the season before and a new one starts in `season`.
 * Returns a new career; without a placement (off every roster) it is unchanged.
 */
export function applyPlacement(career: Career, now: Placement | null, season: number): Career {
  if (!now) return career;
  const stints = career.stints.map(s => ({ ...s }));
  const last = stints[stints.length - 1];
  const lastCode = last ? last.team.split('/').pop() : undefined;
  const open = last !== undefined && (last.to === 'pres' || (typeof last.to === 'number' && last.to >= season - 1));
  if (last && last.kind === now.kind && lastCode === now.team && open) {
    last.to = 'pres';
    last.range = last.from === null ? last.range : `S${last.from}-pres.`;
    return { ...career, stints };
  }
  if (last && last.to === 'pres') {
    last.to = Math.max(last.from ?? 0, season - 1);
    setRange(last);
  }
  stints.push({ kind: now.kind, team: now.team, range: `S${season}-pres.`, from: season, to: 'pres', honours: [] });
  return { ...career, stints };
}
