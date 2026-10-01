import { calendarProblem } from '../season/moves';
import type { JcPostseasonFile } from '../shared/types';
import { bracketResults } from './bracket';
import { confDone, latestRanking } from './confTourney';
import { selectMarchMadness, selectNit } from './field';
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

function withField(ps: JcPostseasonFile, state: JcState, mmTeams: string[], nitTeams: string[], warnings: string[]): JcPostseasonFile {
  const placed = placeRegions(mmTeams, confOfTeam(state));
  return {
    ...ps,
    field: { mm: { teams: mmTeams, seeds: placed.seeds, regions: placed.regions }, nit: { teams: nitTeams }, warnings },
    mm: buildMarchMadness(placed.regions, placed.seeds),
    nit: buildNit(nitTeams),
  };
}

/** Picks the March Madness and NIT fields from the post-tournament ranking. Running it again re-draws them (until a game is played). */
export function setFields(state: JcState): JcResult {
  const problem = problemFor(state);
  if (problem) return jcFail([problem]);
  const ps = state.postseason!;
  const ranking = latestRanking(state);
  if (!ranking) return jcFail(['There is no ranking yet']);
  const { field, leftover } = selectMarchMadness(ranking, ps.conf.map(b => b.champion!), confOfTeam(state));
  const nit = selectNit(leftover, Object.values(ps.rsChampions).flat());
  const postseason = withField(ps, state, field, nit.teams, nit.warnings);
  return { ok: true, state: { ...state, postseason }, changed: ['postseason'], label: ps.field ? 'Re-draw the fields' : 'Set the fields' };
}

/** Swaps `out` of one tournament for `into` (a team in no field, or one in the other field, which then takes `out`'s place). */
export function swapField(state: JcState, tournament: 'mm' | 'nit', out: string, into: string): JcResult {
  const problem = problemFor(state);
  if (problem) return jcFail([problem]);
  const ps = state.postseason!;
  if (!ps.field) return jcFail(['Set the fields first']);
  const mm = [...ps.field.mm.teams];
  const nit = [...ps.field.nit.teams];
  const mine = tournament === 'mm' ? mm : nit;
  const other = tournament === 'mm' ? nit : mm;
  if (out === into) return jcFail(['Pick two different teams']);
  const at = mine.indexOf(out);
  if (at < 0) return jcFail([`${out} isn't in that field`]);
  if (mine.includes(into)) return jcFail([`${into} is already in that field`]);
  if (!state.teams.teams.some(t => t.teamId === into)) return jcFail([`${into} isn't a college team`]);
  const champions = new Set(ps.conf.map(b => b.champion));
  if (tournament === 'mm' && champions.has(out)) return jcFail([`${out} won its conference tournament and must stay in March Madness`]);
  const rs = new Set(Object.values(ps.rsChampions).flat());
  const elsewhere = other.indexOf(into);
  if (elsewhere >= 0) other[elsewhere] = out;
  mine[at] = into;
  const afterMm = tournament === 'mm' ? mine : other;
  const afterNit = tournament === 'mm' ? other : mine;
  if (rs.has(out) && !afterMm.includes(out) && !afterNit.includes(out)) return jcFail([`${out} won a regular-season title and must stay in the NIT or March Madness`]);
  if ([...champions].some(t => !afterMm.includes(t!))) return jcFail(['Every conference tournament champion must stay in March Madness']);
  const postseason = withField(ps, state, afterMm, afterNit, ps.field.warnings);
  return { ok: true, state: { ...state, postseason }, changed: ['postseason'], label: 'Swap a field team' };
}
