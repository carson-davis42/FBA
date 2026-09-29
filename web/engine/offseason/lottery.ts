import type { Rng } from '../d2/random';
import { resolvePicks } from '../roster/picks';
import { appendTx, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import type { ScheduleTeamInfo } from '../season/schedule';
import { betterThan, javaOrder, records, standings } from '../season/standings';
import { markStepDone } from '../shared/calendar';
import type {
  CalendarFile, GameResult, LotteryFile, LotteryOdds, PicksFile, PlayoffsFile, ResultsFile, TeamsFile, TransactionsFile,
} from '../shared/types';

/** Pick-1 odds (percent) by lottery slot, worst team first, keyed by lottery size. The S74 table. */
export const LOTTERY_ODDS: Record<number, number[]> = {
  14: [14, 14, 14, 12.5, 10.5, 9, 7.5, 6, 4.5, 3, 2, 1.5, 1, 0.5],
};

export interface LotteryTeam { teamId: string; w: number; l: number }

/** Odds per team, worst first. Teams tied on W-L share the average of their slots' odds. */
export function lotteryOdds(teams: LotteryTeam[]): { ok: true; odds: LotteryOdds[] } | { ok: false; problem: string } {
  const table = LOTTERY_ODDS[teams.length];
  if (!table) return { ok: false, problem: `No lottery odds for a ${teams.length}-team lottery` };
  const odds = teams.map((t, i) => ({ teamId: t.teamId, slot: i + 1, w: t.w, l: t.l, pct: table[i] }));
  for (let i = 0; i < odds.length;) {
    let j = i;
    while (j + 1 < odds.length && odds[j + 1].w === odds[i].w && odds[j + 1].l === odds[i].l) j++;
    const avg = table.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) odds[k] = { ...odds[k], pct: avg };
    i = j + 1;
  }
  return { ok: true, odds };
}

/** D14: draw pick 1 by the odds, remove the winner, re-normalise, repeat to the last pick. */
export function drawLottery(odds: { teamId: string; pct: number }[], rng: Rng): string[] {
  const pool = [...odds];
  const out: string[] = [];
  while (pool.length) {
    const total = pool.reduce((s, o) => s + o.pct, 0);
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].pct;
      if (r < 0) { idx = i; break; }
    }
    out.push(pool[idx].teamId);
    pool.splice(idx, 1);
  }
  return out;
}

/** D7: the lottery, then everyone else worst first (the lottery's record comparison), the champion always last. */
export function draftOrder(input: { lottery: string[]; teams: ScheduleTeamInfo[]; games: GameResult[]; champion: string }): string[] {
  const drawn = new Set(input.lottery);
  const rest = [...records(input.teams, input.games).values()].filter(r => !drawn.has(r.teamId) && r.teamId !== input.champion);
  const worstFirst = javaOrder(rest, (a, b) => betterThan('fba', a, b), true).map(r => r.teamId);
  return [...input.lottery, ...worstFirst, input.champion];
}

export interface LotteryState {
  season: number;
  calendar: CalendarFile;
  teams: TeamsFile;
  results: ResultsFile;
  playoffs: PlayoffsFile | null;
  picks: PicksFile;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
  lottery: LotteryFile | null;
}

export const lotteryStepId = (season: number) => `s${season + 1}-fba-draft-lottery`;
export const lotteryPath = (season: number) => `leagues/fba/S${season}/lottery.json`;

const teamInfo = (s: LotteryState): ScheduleTeamInfo[] => s.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));

/** The odds table from the final standings (the page shows it before the draw). */
export function lotteryPreview(state: LotteryState): ReturnType<typeof lotteryOdds> {
  const rows = standings('fba', teamInfo(state), state.results.games, undefined, state.playoffs).lottery;
  return lotteryOdds(rows.map(r => ({ teamId: r.teamId, w: r.w, l: r.l })));
}

export function runLottery(state: LotteryState, rng: Rng, ctx: MoveContext): WritesResult {
  const n = state.season;
  if (state.lottery) return { ok: false, problems: ['The lottery has already been run'] };
  const step = calendarProblem(state.calendar, lotteryStepId(n), 'The lottery is run');
  if (step) return { ok: false, problems: [step] };
  const champion = state.playoffs?.outcome?.champions[0]?.teamId;
  if (!champion) return { ok: false, problems: ["The FBA playoffs aren't finished"] };
  const odds = lotteryPreview(state);
  if (!odds.ok) return { ok: false, problems: [odds.problem] };
  const lottery = drawLottery(odds.odds, rng);
  const order = draftOrder({ lottery, teams: teamInfo(state), games: state.results.games, champion });
  let resolved: ReturnType<typeof resolvePicks>;
  try {
    resolved = resolvePicks({ season: n + 1, order, lotterySize: lottery.length, obligations: state.picks.obligations });
  } catch (e) {
    return { ok: false, problems: [(e as Error).message] };
  }
  const doc: LotteryFile = { league: 'fba', season: n, draftSeason: n + 1, locked: true, odds: odds.odds, lottery, order, picks: resolved.picks };
  const tx = appendTx(state.tx, ctx, 'lottery', [lottery[0]], [`S${n + 1} Draft Lottery: ${lottery[0]} wins the first pick`]);
  return {
    ok: true,
    label: `S${n + 1} Draft Lottery`,
    writes: [
      { path: lotteryPath(n), doc },
      { path: 'leagues/fba/picks.json', doc: { ...state.picks, obligations: resolved.obligations } },
      { path: `leagues/fba/S${n}/transactions.json`, doc: tx },
      { path: 'calendar.json', doc: markStepDone(state.calendar, lotteryStepId(n)) },
    ],
  };
}
