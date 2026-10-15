import { calendarProblem } from '../season/moves';
import type { Bracket, FirstFourGame, JcPostseasonFile } from '../shared/types';
import { bracketResults } from './bracket';
import { confDone, latestRanking } from './confTourney';
import { selectFirstFour, selectMarchMadness, selectNit, type FirstFourPair, type FirstFourPick } from './field';
import { buildMarchMadness, buildNit, placeRegions } from './regions';
import { conferenceOf, jcFail, type JcResult, type JcState } from './state';

const played = (ps: JcPostseasonFile): boolean => bracketResults(ps.mm).length + bracketResults(ps.nit).length > 0;

function problemFor(state: JcState): string | null {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return problem;
  if (!state.postseason || !confDone(state)) return 'Finish the conference tournaments first';
  if (played(state.postseason)) return 'A tournament game has been played: the fields are final';
  return null;
}

const confOfTeam = (state: JcState) => (id: string): string => conferenceOf(state.teams, id);

/** The saved First Four entries, and the seeds with each challenger sharing its spot's seed. */
function firstFourEntries(pairs: FirstFourPair[], regions: string[][], seeds: Record<string, number>): { games: FirstFourGame[]; seeds: Record<string, number> } {
  const all = { ...seeds };
  const games = pairs.map(p => {
    const seed = seeds[p.teams[0]];
    all[p.teams[1]] = seed;
    return { id: p.id, group: p.group, teams: p.teams, seed, region: regions.findIndex(r => r.includes(p.teams[0])) };
  });
  return { games, seeds: all };
}

function withField(ps: JcPostseasonFile, state: JcState, mmTeams: string[], nitTeams: string[], warnings: string[], pairs: FirstFourPair[]): JcPostseasonFile {
  const placed = placeRegions(mmTeams, confOfTeam(state));
  const ff = firstFourEntries(pairs, placed.regions, placed.seeds);
  return {
    ...ps,
    field: { mm: { teams: mmTeams, seeds: ff.seeds, regions: placed.regions, firstFour: ff.games }, nit: { teams: nitTeams }, warnings },
    mm: buildMarchMadness(placed.regions, placed.seeds, ff.games),
    nit: buildNit(nitTeams),
  };
}

export interface ComputedField {
  /** The 64 slots; a play-in spot holds the better team of its pair. */
  mmTeams: string[];
  firstFour: FirstFourPick;
  firstFourGames: FirstFourGame[];
  leftover: string[];
  nitTeams: string[];
  warnings: string[];
  seeds: Record<string, number>;
  regions: string[][];
  mm: Bracket;
  nit: Bracket;
}

/** The one place the March Madness and NIT fields are chosen and placed: the real "Set the fields" and Bracketology both use it. */
export function computeField(ranking: string[], champions: string[], rsChampions: string[], confOf: (id: string) => string): ComputedField {
  const picked = selectMarchMadness(ranking, champions, confOf);
  // A conference tournament title guarantees the Round of 64, and a regular-season title at least the NIT: neither plays the First Four.
  const ff = selectFirstFour(ranking, picked.field, picked.leftover, confOf, new Set([...champions, ...rsChampions]));
  const nit = selectNit(ff.leftover, rsChampions);
  const placed = placeRegions(ff.slots, confOf);
  const entries = firstFourEntries(ff.pairs, placed.regions, placed.seeds);
  return {
    mmTeams: ff.slots, firstFour: ff, firstFourGames: entries.games, leftover: ff.leftover, nitTeams: nit.teams,
    warnings: [...ff.warnings, ...nit.warnings], seeds: entries.seeds, regions: placed.regions,
    mm: buildMarchMadness(placed.regions, placed.seeds, entries.games), nit: buildNit(nit.teams),
  };
}

/** Picks the March Madness and NIT fields from the post-tournament ranking. Running it again re-draws them (until a game is played). */
export function setFields(state: JcState): JcResult {
  const problem = problemFor(state);
  if (problem) return jcFail([problem]);
  const ps = state.postseason!;
  const ranking = latestRanking(state);
  if (!ranking) return jcFail(['There is no ranking yet']);
  const c = computeField(ranking, ps.conf.map(b => b.champion!), Object.values(ps.rsChampions).flat(), confOfTeam(state));
  const postseason: JcPostseasonFile = {
    ...ps,
    field: { mm: { teams: c.mmTeams, seeds: c.seeds, regions: c.regions, firstFour: c.firstFourGames }, nit: { teams: c.nitTeams }, warnings: c.warnings },
    mm: c.mm,
    nit: c.nit,
  };
  return { ok: true, state: { ...state, postseason }, changed: ['postseason'], label: ps.field ? 'Re-draw the fields' : 'Set the fields' };
}

/** Swaps `out` of one tournament for `into` (a team in no field, or one in the other field, which then takes `out`'s place). In March Madness `out` may be a slot team or a First Four challenger. */
export function swapField(state: JcState, tournament: 'mm' | 'nit', out: string, into: string): JcResult {
  const problem = problemFor(state);
  if (problem) return jcFail([problem]);
  const ps = state.postseason!;
  if (!ps.field) return jcFail(['Set the fields first']);
  const ffGames = ps.field.mm.firstFour;
  const mmAll = [...ps.field.mm.teams, ...ffGames.map(g => g.teams[1])];
  const nit = ps.field.nit.teams;
  const mine = tournament === 'mm' ? mmAll : nit;
  if (out === into) return jcFail(['Pick two different teams']);
  if (!mine.includes(out)) return jcFail([`${out} isn't in that field`]);
  if (mine.includes(into)) return jcFail([`${into} is already in that field`]);
  if (!state.teams.teams.some(t => t.teamId === into)) return jcFail([`${into} isn't a college team`]);
  const champions = new Set(ps.conf.map(b => b.champion));
  if (tournament === 'mm' && champions.has(out)) return jcFail([`${out} won its conference tournament and must stay in March Madness`]);
  const rs = new Set(Object.values(ps.rsChampions).flat());
  // `out` leaves its own field for `into`; `into` (if it sat in the other field) takes `out`'s place there.
  const inMm = tournament === 'mm' ? (t: string): string => (t === out ? into : t) : (t: string): string => (t === into ? out : t);
  const inNit = tournament === 'mm' ? (t: string): string => (t === into ? out : t) : (t: string): string => (t === out ? into : t);
  const mmSlots = ps.field.mm.teams.map(inMm);
  const pairs: FirstFourPair[] = ffGames.map(g => ({ id: g.id, group: g.group, spot: 0, teams: [inMm(g.teams[0]), inMm(g.teams[1])] }));
  const nitAfter = nit.map(inNit);
  const afterMm = [...mmSlots, ...pairs.map(p => p.teams[1])];
  if (rs.has(out) && !afterMm.includes(out) && !nitAfter.includes(out)) return jcFail([`${out} won a regular-season title and must stay in the NIT or March Madness`]);
  if ([...champions].some(t => !afterMm.includes(t!))) return jcFail(['Every conference tournament champion must stay in March Madness']);
  const postseason = withField(ps, state, mmSlots, nitAfter, ps.field.warnings, pairs);
  return { ok: true, state: { ...state, postseason }, changed: ['postseason'], label: 'Swap a field team' };
}
