import type { Champion, JcSchoolHistoryFile, JcSummary, PastBracket, SummaryFile, Team } from '../shared/types';

/** The college league numbered its own seasons S1-S18 until it joined the shared calendar at S48 (no S19-S47 exist). */
export const JC_OWN_NUMBER_LAST = 18;
export const JC_SHARED_FROM = 48;

/** When each of the college league's own seasons was played: S1 and S2 in the FFL era, then S3 at FBA S11, S4 and S5 at FBA S28 and S29, S6-S18 at FBA S32-S44. */
export const JC_EARLY_SEASONS: Record<number, { era: 'FFL' | 'FBA'; season: number }> = {
  1: { era: 'FFL', season: 46 }, 2: { era: 'FFL', season: 47 }, 3: { era: 'FBA', season: 11 }, 4: { era: 'FBA', season: 28 }, 5: { era: 'FBA', season: 29 },
  ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [6 + i, { era: 'FBA', season: 32 + i }])),
};

/** "S11 · FBA S37" for the own-numbered seasons, "S48" from the shared calendar on. */
export function jcSeasonLabel(season: number): string {
  const e = JC_EARLY_SEASONS[season];
  return e ? `S${season} · ${e.era} S${e.season}` : `S${season}`;
}

/** Imported seasons say "National Champion", seasons the app finished say "FBAJC National Champion". */
export const isJcNationalTitle = (title: string): boolean => /National Champion$/.test(title);
export const isJcNitTitle = (title: string): boolean => title === 'NIT Champion';

export interface JcTitleRow { season: number; national: Champion | null; nit: Champion | null }

/** One row per season, newest first. */
export function jcTitleRows(seasons: SummaryFile[]): JcTitleRow[] {
  return [...seasons].sort((a, b) => b.season - a.season).map(s => ({
    season: s.season,
    national: s.champions.find(c => isJcNationalTitle(c.title)) ?? null,
    nit: s.champions.find(c => isJcNitTitle(c.title)) ?? null,
  }));
}

export interface JcTitleCount { key: string; name: string; national: number[]; runnerUp: number[]; nit: number[]; nitRunnerUp: number[] }
const keyOf = (id: string | undefined, name: string): string => id ?? name;

/** Titles and runner-up finishes per team (keyed by team id, else name), most national titles first. */
export function jcTitleCounts(rows: JcTitleRow[]): JcTitleCount[] {
  const by = new Map<string, JcTitleCount>();
  const at = (id: string | undefined, name: string): JcTitleCount => {
    const key = keyOf(id, name);
    return by.get(key) ?? by.set(key, { key, name, national: [], runnerUp: [], nit: [], nitRunnerUp: [] }).get(key)!;
  };
  for (const r of [...rows].sort((a, b) => a.season - b.season)) {
    if (r.national) { at(r.national.teamId, r.national.champion).national.push(r.season); if (r.national.runnerUp) at(r.national.runnerUpId, r.national.runnerUp).runnerUp.push(r.season); }
    if (r.nit) { at(r.nit.teamId, r.nit.champion).nit.push(r.season); if (r.nit.runnerUp) at(r.nit.runnerUpId, r.nit.runnerUp).nitRunnerUp.push(r.season); }
  }
  return [...by.values()].sort((a, b) => b.national.length - a.national.length || b.runnerUp.length - a.runnerUp.length || b.nit.length - a.nit.length || a.name.localeCompare(b.name));
}

export type MmRound = 'app' | 'sweet16' | 'elite8' | 'final4' | 'titleGame' | 'champion';

/** The deepest round each team reached in a 64-team March Madness bracket (a bracket of any other size gives nothing). Lost in the first two rounds = an appearance. */
export function mmRoundsFromBracket(b: PastBracket): Map<string, MmRound> {
  const out = new Map<string, MmRound>();
  if (b.rounds !== 6) return out;
  const names: MmRound[] = ['app', 'app', 'sweet16', 'elite8', 'final4', 'titleGame'];
  const rank = (r: MmRound) => ['app', 'sweet16', 'elite8', 'final4', 'titleGame', 'champion'].indexOf(r);
  const put = (name: string, r: MmRound) => { const cur = out.get(name); if (!cur || rank(r) > rank(cur)) out.set(name, r); };
  for (const s of b.series) {
    for (const side of [s.home, s.away]) if (side) put(side.name, names[s.round - 1]);
    if (s.round === 6) { const w = s[s.winner]; if (w) put(w.name, 'champion'); }
  }
  return out;
}

export interface JcSchoolCase {
  national: number[];
  runnerUp: number[];
  nit: number[];
  nitRunnerUp: number[];
  rsTitles: { season: number; conf: string | null }[];
  tournamentTitles: { season: number; conf: string | null }[];
  preseason: { season: number; event: string }[];
  mm: { season: number; round: MmRound }[];
  awards: {
    national: { season: number; award: string; playerId: string | null; name: string | null }[];
    conference: { season: number; conf: string; playerId: string | null; name: string | null }[];
    allAmerican: { season: number; team: number; slot: string; playerId: string | null; name: string | null }[];
  };
}

/**
 * One school's record. Titles and runner-ups come from the summaries. Conference titles and March Madness rounds come from the imported school
 * history through S78 and from the app's own summaries after it (the school doc is the authority for S1-S78). Without a school doc the
 * summaries stand in for the conference titles and nothing is known about the March Madness rounds before S79.
 */
export function jcSchoolCase(team: Team, seasons: SummaryFile[], school: JcSchoolHistoryFile['schools'][number] | null): JcSchoolCase {
  const mine = (id: string | null | undefined, name?: string | null): boolean => id === team.teamId || (!id && name === team.name);
  const out: JcSchoolCase = { national: [], runnerUp: [], nit: [], nitRunnerUp: [], rsTitles: [], tournamentTitles: [], preseason: [], mm: [], awards: { national: [], conference: [], allAmerican: [] } };
  const through = school ? 78 : 0;
  const rounds = new Map<number, MmRound>();
  if (school) {
    const order: [keyof JcSchoolHistoryFile['schools'][number]['mm'], MmRound][] = [['app', 'app'], ['sweet16', 'sweet16'], ['elite8', 'elite8'], ['final4', 'final4'], ['titleGame', 'titleGame'], ['champion', 'champion']];
    for (const [list, round] of order) for (const sn of school.mm[list]) rounds.set(sn, round);
    out.rsTitles.push(...school.rsChampion);
    out.tournamentTitles.push(...school.confTournament);
  }
  for (const s of [...seasons].sort((a, b) => a.season - b.season)) {
    for (const c of s.champions) {
      const [id, rid] = [c.teamId, c.runnerUpId];
      if (isJcNationalTitle(c.title)) {
        if (mine(id, c.champion)) out.national.push(s.season);
        else if (mine(rid, c.runnerUp)) out.runnerUp.push(s.season);
      } else if (isJcNitTitle(c.title)) {
        if (mine(id, c.champion)) out.nit.push(s.season);
        else if (mine(rid, c.runnerUp)) out.nitRunnerUp.push(s.season);
      }
    }
    const jc: JcSummary | undefined = s.jc;
    if (!jc) continue;
    if (s.season > through) {
      for (const cc of jc.confChampions) {
        if (cc.regularSeason.some(x => x === team.teamId || x === team.name)) out.rsTitles.push({ season: s.season, conf: null });
        if (cc.tournament === team.teamId || cc.tournament === team.name) out.tournamentTitles.push({ season: s.season, conf: null });
      }
      if (s.pastBracket) {
        const r = mmRoundsFromBracket(s.pastBracket).get(team.name);
        if (r) rounds.set(s.season, r);
      }
    }
    for (const p of jc.preseason ?? []) if (mine(p.teamId, p.champion)) out.preseason.push({ season: s.season, event: p.event });
    for (const a of jc.national) if (mine(a.teamId, a.school)) out.awards.national.push({ season: s.season, award: a.award, playerId: a.playerId, name: a.name ?? null });
    for (const a of jc.conference) if (mine(a.teamId, a.school)) out.awards.conference.push({ season: s.season, conf: a.conf, playerId: a.playerId, name: a.name ?? null });
    for (const t of jc.allAmerican ?? []) for (const sl of t.slots) if (mine(sl.teamId, sl.school)) out.awards.allAmerican.push({ season: s.season, team: t.team, slot: sl.slot, playerId: sl.playerId, name: sl.name ?? null });
    for (const t of jc.allAmericanLegacy?.teams ?? []) for (const sl of t.slots) if (mine(sl.teamId, sl.school)) out.awards.allAmerican.push({ season: s.season, team: t.team, slot: sl.slot, playerId: sl.playerId, name: sl.name });
  }
  out.rsTitles.sort((a, b) => a.season - b.season);
  out.tournamentTitles.sort((a, b) => a.season - b.season);
  out.mm = [...rounds].map(([season, round]) => ({ season, round })).sort((a, b) => a.season - b.season);
  return out;
}
