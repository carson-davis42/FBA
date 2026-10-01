import { americanOdds, raceOdds } from '../awards/score';
import { pointsSavedPerGame, seasonDefense, type DefenseTotals } from '../awards/defense';
import { playerSeasonStats } from '../season/ratingPause';
import { calendarProblem } from '../season/moves';
import { JC_NATIONAL_AWARDS, type JcAwardsFile, type JcNationalAward, type Position, type ResultsFile } from '../shared/types';
import { confTables, latestRanking, postseasonGames } from './confTourney';
import { jcFail, type JcResult, type JcState } from './state';
import { teamRating } from './rankings';

export const MIN_JC_RACE_GAMES = 5;
const TEMPERATURE = 8;

export const NATIONAL_LABEL: Record<JcNationalAward, string> = {
  POY: 'Trae York Player of the Year',
  FOY: 'Angelo Farrell Freshman of the Year',
  GOY: 'Rhett Blackwell Guard of the Year',
  FWD: 'Jacob Peters Forward of the Year',
  COY: 'Dustin Holloway Center of the Year',
  DPOY: 'Dawson Chudnovsky Defensive Player of the Year',
};
const NATIONAL_LIMIT: Record<JcNationalAward, number> = { POY: 15, FOY: 15, GOY: 10, FWD: 10, COY: 10, DPOY: 10 };
const NATIONAL_POSITIONS: Record<JcNationalAward, Position[] | null> = {
  POY: null, FOY: null, GOY: ['PG', 'SG'], FWD: ['SF', 'PF'], COY: ['C'], DPOY: null,
};

/** Port of `getAwardScore` (Main.java:3467): each part on a 0-100 scale, then 40 / 35 / 25. */
export function jcAwardScore(ppg: number, rating: number, teamScore: number): number {
  const ppgScore = ((Number.isNaN(ppg) ? 0 : ppg) / 30) * 100;
  const ratingScore = ((rating - 60) / 39) * 100;
  return ppgScore * 0.4 + ratingScore * 0.35 + teamScore * 0.25;
}

/** Port of `getTeamSuccessScore`. `rank` is the 1-based national rank (null = no ranking yet); `conf` is the team's place in its conference table. */
export function teamSuccess(rank: number | null, teamRatingNow: number, avgTeamRating: number, conf: { pos: number; size: number } | null): number {
  if (conf) return Math.max(10, 101 - Math.trunc(((conf.pos - 1) / conf.size) * 100));
  if (rank === null) return 50;
  if (rank <= 25) return Math.max(10, 101 - rank);
  return Math.max(10, Math.min(50, Math.trunc(teamRatingNow - avgTeamRating + 30)));
}

/** The Java odds: the top 8 share the probability by exp((score - best) / 8); everyone after them is +10000. */
export function jcOdds(scores: number[]): string[] {
  const pool = Math.min(8, scores.length);
  if (!scores.length) return [];
  const best = scores[0];
  const weights = scores.slice(0, pool).map(s => Math.exp((s - best) / TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);
  return scores.map((_, i) => (i < pool ? americanOdds(weights[i] / total) : '+10000'));
}

export interface JcRaceRow {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  games: number;
  ppg: number;
  /** The award score, or points saved per game for the Defensive POY. */
  score: number;
  odds: string;
  defense: { perGame: number; stopRate: number; saved: number } | null;
}
export interface JcRace {
  /** A national award id or a conference code. */
  id: string;
  kind: 'national' | 'conference';
  label: string;
  limit: number;
  rows: JcRaceRow[];
}

interface Cand {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  classYear: string | null;
  games: number;
  ppg: number;
  def: DefenseTotals | undefined;
}

/** The games the races count: the regular season and the conference tournaments. */
function raceResults(state: JcState): ResultsFile | null {
  if (!state.results) return null;
  return { ...state.results, games: [...state.results.games, ...postseasonGames(state.postseason)] };
}

function candidates(state: JcState): Cand[] {
  const results = raceResults(state);
  const stats = playerSeasonStats(results);
  const def = seasonDefense(results);
  const out: Cand[] = [];
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    for (const e of entries) {
      if (e.playerId === null || e.rating === null) continue;
      const s = stats.get(e.playerId);
      if (!s || s.games < MIN_JC_RACE_GAMES) continue;
      out.push({ playerId: e.playerId, teamId, position: e.position, rating: e.rating, classYear: e.classYear ?? null, games: s.games, ppg: s.pts / s.games, def: def.get(e.playerId) });
    }
  }
  return out;
}

const bySort = (a: JcRaceRow, b: JcRaceRow): number =>
  b.score - a.score || b.ppg - a.ppg || b.rating - a.rating || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);

/** Every award race: the six national ones, then one per conference, from the regular season and the conference tournaments. */
export function jcRaces(state: JcState): JcRace[] {
  const cands = candidates(state);
  const ranking = latestRanking(state);
  const rankOf = new Map((ranking ?? []).map((t, i) => [t, i + 1]));
  const ratings = new Map(Object.entries(state.rosters.teams).map(([id, r]) => [id, teamRating(r)]));
  const avg = [...ratings.values()].reduce((a, b) => a + b, 0) / Math.max(1, ratings.size);
  const tables = confTables(state);
  const confPos = new Map<string, { pos: number; size: number }>();
  for (const t of tables) t.order.forEach((id, i) => confPos.set(id, { pos: i + 1, size: t.order.length }));
  const confOf = new Map(state.teams.teams.map(t => [t.teamId, t.group]));

  const scored = (c: Cand, conference: boolean): JcRaceRow => {
    const team = conference
      ? teamSuccess(null, 0, 0, confPos.get(c.teamId) ?? null)
      : teamSuccess(ranking ? (rankOf.get(c.teamId) ?? null) : null, ratings.get(c.teamId) ?? 0, avg, null);
    return { playerId: c.playerId, teamId: c.teamId, position: c.position, rating: c.rating, games: c.games, ppg: c.ppg, score: jcAwardScore(c.ppg, c.rating, team), odds: '', defense: null };
  };
  const race = (id: string, kind: JcRace['kind'], label: string, limit: number, rows: JcRaceRow[], odds: (scores: number[]) => string[]): JcRace => {
    const sorted = [...rows].sort(bySort);
    const o = odds(sorted.slice(0, limit).map(r => r.score));
    return { id, kind, label, limit, rows: sorted.map((r, i) => ({ ...r, odds: o[i] ?? '' })) };
  };

  const national: JcRace[] = JC_NATIONAL_AWARDS.map(award => {
    if (award === 'DPOY') {
      const rows = cands.filter(c => c.def && c.def.games >= MIN_JC_RACE_GAMES).map(c => {
        const saved = pointsSavedPerGame(c.def!);
        return { ...scored(c, false), score: saved, defense: { perGame: c.def!.def / c.def!.games, stopRate: c.def!.def ? c.def!.stops / c.def!.def : 0, saved } };
      });
      return race(award, 'national', NATIONAL_LABEL[award], NATIONAL_LIMIT[award], rows, raceOdds);
    }
    const pos = NATIONAL_POSITIONS[award];
    const rows = cands.filter(c => (pos === null || pos.includes(c.position)) && (award !== 'FOY' || c.classYear === 'Fr')).map(c => scored(c, false));
    return race(award, 'national', NATIONAL_LABEL[award], NATIONAL_LIMIT[award], rows, jcOdds);
  });
  const conferences = state.teams.teams.map(t => t.group).filter((g, i, all): g is string => g !== null && all.indexOf(g) === i);
  const conference: JcRace[] = conferences.map(conf =>
    race(conf, 'conference', `${conf} Player of the Year`, 10, cands.filter(c => confOf.get(c.teamId) === conf).map(c => scored(c, true)), jcOdds));
  return [...national, ...conference];
}

const emptyAwards = (state: JcState): JcAwardsFile => ({
  league: 'fbajc', season: state.season, locked: false,
  national: JC_NATIONAL_AWARDS.map(award => ({ award, playerId: null })),
  conference: [...new Set(state.teams.teams.map(t => t.group).filter((g): g is string => g !== null))].map(conf => ({ conf, playerId: null })),
  allAmerican: null,
  mvp: { mm: null, nit: null },
});

/** Opens the awards once the fields are set; the NIT cannot start until every award has a winner. */
export function startAwards(state: JcState): JcResult {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return jcFail([problem]);
  if (!state.postseason?.field) return jcFail(['Set the fields first']);
  if (state.awards) return jcFail(['The awards have already started']);
  return { ok: true, state: { ...state, awards: emptyAwards(state) }, changed: ['awards'], label: 'Start the awards' };
}

export const awardsComplete = (doc: JcAwardsFile | null): boolean =>
  !!doc && doc.national.every(a => a.playerId !== null) && doc.conference.every(a => a.playerId !== null);

function rosterEntry(state: JcState, playerId: string): { teamId: string; position: Position; classYear: string | null } | null {
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    const e = entries.find(x => x.playerId === playerId);
    if (e) return { teamId, position: e.position, classYear: e.classYear ?? null };
  }
  return null;
}

function awardsProblem(state: JcState): string | null {
  const problem = calendarProblem(state.calendar, 'fbajc', 'The season is played');
  if (problem) return problem;
  if (!state.awards) return 'Start the awards first';
  if (state.awards.locked) return 'The awards are locked';
  return null;
}

/** Picks (or, with null, clears) a national award winner. Only the NIT's start locks the picks. */
export function pickNational(state: JcState, award: JcNationalAward, playerId: string | null): JcResult {
  const problem = awardsProblem(state);
  if (problem) return jcFail([problem]);
  if (playerId !== null) {
    const e = rosterEntry(state, playerId);
    if (!e) return jcFail(['That player is not on a college roster']);
    const pos = NATIONAL_POSITIONS[award];
    if (pos && !pos.includes(e.position)) return jcFail([`${NATIONAL_LABEL[award]} goes to a ${pos.join(' or ')}`]);
    if (award === 'FOY' && e.classYear !== 'Fr') return jcFail(['The Freshman of the Year must be a freshman']);
  }
  const awards: JcAwardsFile = { ...state.awards!, national: state.awards!.national.map(a => (a.award === award ? { ...a, playerId } : a)) };
  return { ok: true, state: { ...state, awards }, changed: ['awards'], label: `Pick the ${award}` };
}

export function pickConference(state: JcState, conf: string, playerId: string | null): JcResult {
  const problem = awardsProblem(state);
  if (problem) return jcFail([problem]);
  if (!state.awards!.conference.some(a => a.conf === conf)) return jcFail([`${conf} isn't a conference`]);
  if (playerId !== null) {
    const e = rosterEntry(state, playerId);
    if (!e) return jcFail(['That player is not on a college roster']);
    if (state.teams.teams.find(t => t.teamId === e.teamId)?.group !== conf) return jcFail([`That player isn't in ${conf}`]);
  }
  const awards: JcAwardsFile = { ...state.awards!, conference: state.awards!.conference.map(a => (a.conf === conf ? { ...a, playerId } : a)) };
  return { ok: true, state: { ...state, awards }, changed: ['awards'], label: `Pick the ${conf} Player of the Year` };
}
