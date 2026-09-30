import { finalsMvpCandidates, seasonStandings } from '../playoffs/moves';
import { POSITIONS } from '../roster/rules';
import { groupLabel } from '../shared/leagues';
import type { BoxLine, GameResult, Position, RatingPauseFile, RostersFile, SeasonTotals, SummaryFile, SummaryPlayerLine } from '../shared/types';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import { leagueStepProblem } from './moves';
import { CALENDAR_STEP, playerName, seasonFail, type SeasonDocKey, type SeasonResult, type SeasonState } from './state';

const zero = (): SeasonTotals => ({ g: 0, pts: 0, def: 0, stops: 0, allowed: 0, exp: 0 });

const sum = (a: SeasonTotals, b: SeasonTotals): SeasonTotals => ({
  g: a.g + b.g, pts: a.pts + b.pts, def: a.def + b.def, stops: a.stops + b.stops, allowed: a.allowed + b.allowed, exp: a.exp + b.exp,
});

/** Adds one box line; the defense fields only count on lines that carry them (games from 2b-2b on). */
function addLine(t: SeasonTotals, line: BoxLine): void {
  t.g++;
  t.pts += line.pts;
  if (line.def === undefined) return;
  t.def += line.def;
  t.stops += line.stops ?? 0;
  t.allowed += line.allowed ?? 0;
  t.exp += line.exp ?? 0;
}

interface Stint { teamId: string; position: Position; rs: SeasonTotals; po: SeasonTotals | null }

/**
 * Every player's season lines from the box scores: one per team stint (a new stint whenever his team changes),
 * plus a season total for players with two or more stints. Sorted by player id.
 */
export function playerLines(games: { regular: GameResult[]; playoffs: GameResult[] }, rosters: RostersFile, pauses: RatingPauseFile[]): SummaryPlayerLine[] {
  const stints = new Map<string, Stint[]>();
  const visit = (g: GameResult, playoffs: boolean) => {
    for (const side of ['home', 'away'] as const) {
      const teamId = g[side];
      (g.box?.[side] ?? []).forEach((line, k) => {
        const list = stints.get(line.playerId) ?? [];
        let cur = list.at(-1);
        if (!cur || cur.teamId !== teamId) {
          cur = { teamId, position: POSITIONS[k], rs: zero(), po: null };
          list.push(cur);
          stints.set(line.playerId, list);
        }
        if (playoffs) addLine((cur.po ??= zero()), line);
        else addLine(cur.rs, line);
      });
    }
  };
  for (const g of games.regular) visit(g, false);
  for (const g of games.playoffs) visit(g, true);

  const rating = new Map<string, number | null>();
  for (const entries of Object.values(rosters.teams)) for (const e of entries) if (e.playerId) rating.set(e.playerId, e.rating);
  const start = new Map<string, number>();
  for (const p of [...pauses].sort((a, b) => a.afterGame - b.afterGame)) {
    for (const r of p.players) if (!start.has(r.playerId)) start.set(r.playerId, r.oldRating);
  }

  const out: SummaryPlayerLine[] = [];
  for (const playerId of [...stints.keys()].sort()) {
    const list = stints.get(playerId)!;
    const ratingEnd = rating.get(playerId) ?? null;
    const ratingStart = start.get(playerId) ?? ratingEnd;
    list.forEach((s, k) => out.push({ playerId, teamId: s.teamId, stint: k + 1, position: s.position, ratingStart, ratingEnd, rs: s.rs, po: s.po }));
    if (list.length > 1) {
      const po = list.reduce<SeasonTotals | null>((acc, s) => (s.po ? (acc ? sum(acc, s.po) : s.po) : acc), null);
      out.push({ playerId, teamId: null, stint: null, position: list.at(-1)!.position, ratingStart, ratingEnd, rs: list.map(s => s.rs).reduce(sum), po });
    }
  }
  return out;
}

/** The locked record of a finished season (spec section 4), built from the league's season docs. */
export function seasonRecord(state: SeasonState, pauses: RatingPauseFile[]): SummaryFile {
  const pf = state.playoffs;
  const teamName = (id: string) => state.teams.teams.find(t => t.teamId === id)?.name ?? id;
  const champions = (pf?.outcome?.champions ?? []).map(c => ({
    title: c.group === null ? 'FBA Champion' : `${groupLabel('fbad2', c.group)} Champion`,
    champion: teamName(c.teamId),
    runnerUp: teamName(c.runnerUp),
    score: c.score,
    teamId: c.teamId,
    runnerUpId: c.runnerUp,
    group: c.group,
    finalsMvp: c.finalsMvp ?? null,
  }));
  const seedOf = new Map((pf?.seeds ?? []).flatMap(s => s.teams.map((t, i) => [t, i + 1] as const)));
  const lastRound = new Map<string, number>();
  for (const s of pf?.series ?? []) {
    for (const t of [s.home, s.away]) if (t) lastRound.set(t, Math.max(lastRound.get(t) ?? 0, s.round));
  }
  const titled = new Set((pf?.outcome?.champions ?? []).map(c => c.teamId));
  const standings = seasonStandings(state).groups.flatMap(g => g.rows.map(r => ({
    teamId: r.teamId,
    name: teamName(r.teamId),
    group: g.group,
    rank: r.seed,
    w: r.w,
    l: r.l,
    confW: r.confW,
    confL: r.confL,
    diff: r.diff,
    marker: r.marker,
    seed: seedOf.get(r.teamId) ?? null,
    playoff: lastRound.has(r.teamId) ? { round: lastRound.get(r.teamId)!, champion: titled.has(r.teamId) } : null,
  })));
  const a = state.allstar;
  const allStar = state.league === 'fba' && a?.selections
    ? {
      allStars: a.selections.allStars,
      youngStars: a.selections.youngStars,
      asgMvp: a.asg?.mvp ?? null,
      fivePoint: a.fivePoint?.winner ?? null,
      dunk: a.dunk?.winner ?? null,
      asgWinner: a.asg ? `Team ${playerName(state, a.selections.captains[a.asg.game.winner])}` : null,
      asgLoser: a.asg ? `Team ${playerName(state, a.selections.captains[1 - a.asg.game.winner])}` : null,
      ysgWinner: a.ysg ? `Team ${playerName(state, a.selections.youngCaptains[a.ysg.champion])}` : null,
      ysgMvp: a.ysg?.mvp ?? null,
    }
    : null;
  return {
    league: state.league,
    season: state.season,
    locked: true,
    host: null,
    champions,
    awards: state.awards?.awards ?? [],
    allFba: state.league === 'fba' ? state.awards?.allFba ?? null : null,
    allStar,
    standings,
    bracket: pf ? { seeds: pf.seeds, series: pf.series } : null,
    promotion: state.league === 'fbad2' ? pf?.outcome?.promotion ?? null : null,
    players: playerLines({ regular: state.results?.games ?? [], playoffs: pf?.games ?? [] }, state.rosters, pauses),
  };
}

const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;
const LOCKABLE = ['schedule', 'results', 'playoffs', 'allstar'] as const;

/** Locks a doc that isn't locked yet; the server refuses to rewrite a locked doc, so locked ones are left alone. */
const locked = <T extends { locked: boolean }>(d: T | null): T | null => (d && !d.locked ? { ...d, locked: true } : d);

/**
 * "Finish S{n} season": writes the locked season record, locks the season's game docs, logs a `season`
 * transaction and marks the league's calendar step done. `pauses` are every rating-pause doc of the season.
 */
export function finishSeason(state: SeasonState, pauses: RatingPauseFile[], ctx: MoveContext): SeasonResult {
  const name = LEAGUE_NAME[state.league];
  const problems: string[] = [];
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) problems.push(step);
  if (!state.playoffs?.outcome) problems.push('Finish the playoffs first');
  if (!state.awards?.locked) problems.push(`Lock the S${state.season} awards first`);
  if (state.summary) problems.push(`The S${state.season} ${name} season is already finished`);
  const champs = state.playoffs?.outcome?.champions ?? [];
  // A pick is only required when the champion has candidates (box scores in the final) to choose from.
  const needsPick = champs.some(c => !c.finalsMvp && finalsMvpCandidates(state, c.group).length > 0);
  if (state.league === 'fba' && needsPick) problems.push('Pick the Finals MVP first');
  if (state.league === 'fbad2' && needsPick) problems.push('Pick every Series MVP first');
  for (const p of pauses) if (!p.locked) problems.push(`Finish the rating adjustments after game ${p.afterGame} first`);
  if (problems.length) return seasonFail(problems);

  const toLock = LOCKABLE.filter(k => state[k] !== null && !state[k]!.locked);
  const changed: SeasonDocKey[] = ['summary', ...toLock, 'tx', 'calendar'];
  return {
    ok: true,
    state: {
      ...state,
      summary: seasonRecord(state, pauses),
      schedule: locked(state.schedule),
      results: locked(state.results),
      playoffs: locked(state.playoffs),
      allstar: locked(state.allstar),
      tx: appendTx(state.tx, ctx, 'season', [], [`S${state.season} ${name} season finished`]),
      calendar: markStepDone(state.calendar, CALENDAR_STEP[state.league]),
    },
    changed,
    label: `Finish S${state.season} ${name} season`,
  };
}
