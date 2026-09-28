import type { GameResult } from '../shared/types';
import { powerRankings } from '../playoffs/ranker';
import { orderTeams, type TieNote } from '../playoffs/tiebreak';
import type { ScheduleTeamInfo, SeasonLeague } from './schedule';

export const GROUP_ORDER: Record<SeasonLeague, string[]> = { fba: ['E', 'W'], fbad2: ['PL', 'WL', 'UL', 'IL'] };
export const PLAYOFF_SEEDS = 8;
export const SEASON_LENGTH: Record<SeasonLeague, { games: number; confGames: number }> = {
  fba: { games: 86, confGames: 56 },
  fbad2: { games: 30, confGames: 30 },
};

export interface TeamRecord {
  teamId: string;
  group: string;
  w: number;
  l: number;
  confW: number;
  confL: number;
  pf: number;
  pa: number;
  /** Wins against each opponent faced (0 when they've played but this team hasn't won). */
  h2h: Map<string, number>;
  log: ('W' | 'L')[];
}

export interface StandingRow {
  teamId: string;
  group: string;
  seed: number;
  w: number;
  l: number;
  pct: number;
  gb: number;
  confW: number;
  confL: number;
  diff: number;
  l10: string;
  streak: string;
  marker: '*' | 'x' | 'n' | null;
}

export interface Standings {
  groups: { group: string; rows: StandingRow[]; notes: TieNote[] }[];
  /** FBA only: non-playoff teams, worst first. */
  lottery: StandingRow[];
}

export interface ClinchRecord { w: number; l: number; confW: number; confL: number }

export function records(teams: ScheduleTeamInfo[], games: GameResult[]): Map<string, TeamRecord> {
  const out = new Map<string, TeamRecord>();
  for (const t of teams) {
    out.set(t.teamId, { teamId: t.teamId, group: t.group ?? '', w: 0, l: 0, confW: 0, confL: 0, pf: 0, pa: 0, h2h: new Map(), log: [] });
  }
  for (const g of games) {
    const home = out.get(g.home);
    const away = out.get(g.away);
    if (!home || !away) continue;
    const [winner, loser] = g.homePts > g.awayPts ? [home, away] : [away, home];
    const same = home.group === away.group;
    winner.w++;
    loser.l++;
    if (same) {
      winner.confW++;
      loser.confL++;
    }
    home.pf += g.homePts;
    home.pa += g.awayPts;
    away.pf += g.awayPts;
    away.pa += g.homePts;
    winner.h2h.set(loser.teamId, (winner.h2h.get(loser.teamId) ?? 0) + 1);
    if (!loser.h2h.has(winner.teamId)) loser.h2h.set(winner.teamId, 0);
    winner.log.push('W');
    loser.log.push('L');
  }
  return out;
}

const diffOf = (r: TeamRecord) => r.pf - r.pa;

/** Java Team.isBetterThan with point-differential and team-id fallbacks. Used for the lottery order only. */
export function betterThan(league: SeasonLeague, a: TeamRecord, b: TeamRecord): boolean {
  const gb = ((a.w - b.w) + (b.l - a.l)) / 2;
  if (gb > 0) return true;
  if (gb < 0) return false;
  if (a.w + a.l < b.w + b.l) return true;
  if (a.w + a.l > b.w + b.l) return false;
  if (league === 'fba' && a.group === b.group) {
    if (a.confW > b.confW) return true;
    if (a.confW < b.confW) return false;
  }
  if (a.h2h.has(b.teamId) || b.h2h.has(a.teamId)) {
    const x = a.h2h.get(b.teamId) ?? 0;
    const y = b.h2h.get(a.teamId) ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  if (diffOf(a) !== diffOf(b)) return diffOf(a) > diffOf(b);
  return a.teamId < b.teamId;
}

/** Java updateStandHelp: repeatedly select the best (or, reversed, the worst) remaining team. */
export function javaOrder<T>(list: T[], better: (a: T, b: T) => boolean, reverse = false): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (pool.length) {
    let best = pool[0];
    for (const t of pool) {
      if (reverse ? better(best, t) : !better(best, t)) best = t;
    }
    out.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return out;
}

const played = (r: ClinchRecord) => r.w + r.l;
const confPlayed = (r: ClinchRecord) => r.confW + r.confL;

function clinchStar(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }): boolean {
  if (i >= 1) return false;
  const t = conf[i];
  for (let j = 0; j < conf.length; j++) {
    if (j === i) continue;
    const temp = conf[j];
    const maxW = temp.w + (len.games - played(temp));
    if (t.w <= maxW) {
      if (t.w < maxW) return false;
      const maxCW = temp.confW + (len.confGames - confPlayed(temp));
      if (t.confW <= maxCW) {
        if (t.confW < maxCW) return false;
        if (played(t) === len.games && played(temp) === len.games && j < i) return false;
      }
    }
  }
  return true;
}

function clinchX(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }): boolean {
  if (i >= PLAYOFF_SEEDS) return false;
  const t = conf[i];
  for (let j = PLAYOFF_SEEDS; j < conf.length; j++) {
    if (j === i) continue;
    const temp = conf[j];
    const maxW = temp.w + (len.games - played(temp));
    if (t.w <= maxW) {
      if (t.w < maxW) return false;
      const maxCW = temp.confW + (len.confGames - confPlayed(temp));
      if (t.confW <= maxCW) {
        if (t.confW < maxCW) return false;
        if (played(t) === len.games && played(temp) === len.games && j < i) return false;
      }
    }
  }
  return true;
}

function clinchN(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }): boolean {
  if (i <= PLAYOFF_SEEDS - 1) return false;
  const t = conf[i];
  const maxW = t.w + (len.games - played(t));
  const maxCW = t.confW + (len.confGames - confPlayed(t));
  for (let j = 0; j < Math.min(PLAYOFF_SEEDS, conf.length); j++) {
    if (j === i) continue;
    const temp = conf[j];
    if (temp.w <= maxW) {
      if (temp.w < maxW) return false;
      if (temp.confW <= maxCW) {
        if (temp.confW < maxCW) return false;
        if (played(t) === len.games && played(temp) === len.games && j > i) return false;
      }
    }
  }
  return true;
}

/** The Java marker for the team at `index` of a sorted conference: '*' #1 seed, 'x' playoff spot, 'n' eliminated. */
export function markerFor(conf: ClinchRecord[], index: number, len: { games: number; confGames: number }): '*' | 'x' | 'n' | null {
  if (clinchStar(conf, index, len)) return '*';
  if (clinchX(conf, index, len)) return 'x';
  if (clinchN(conf, index, len)) return 'n';
  return null;
}

function streakOf(log: ('W' | 'L')[]): string {
  if (!log.length) return '—';
  const last = log[log.length - 1];
  let n = 0;
  for (let k = log.length - 1; k >= 0 && log[k] === last; k--) n++;
  return `${last}${n}`;
}

function lastTen(log: ('W' | 'L')[]): string {
  const ten = log.slice(-10);
  return `${ten.filter(x => x === 'W').length}-${ten.filter(x => x === 'L').length}`;
}

function toRows(league: SeasonLeague, ordered: TeamRecord[], len: { games: number; confGames: number }): StandingRow[] {
  const top = ordered[0];
  return ordered.map((r, i) => ({
    teamId: r.teamId,
    group: r.group,
    seed: i + 1,
    w: r.w,
    l: r.l,
    pct: r.w + r.l ? r.w / (r.w + r.l) : 0,
    gb: top ? ((top.w - r.w) + (r.l - top.l)) / 2 : 0,
    confW: r.confW,
    confL: r.confL,
    diff: diffOf(r),
    l10: lastTen(r.log),
    streak: streakOf(r.log),
    marker: league === 'fba' ? markerFor(ordered, i, len) : null,
  }));
}

export function standings(league: SeasonLeague, teams: ScheduleTeamInfo[], games: GameResult[], len = SEASON_LENGTH[league]): Standings {
  const recs = records(teams, games);
  const better = (a: TeamRecord, b: TeamRecord) => betterThan(league, a, b);
  let ranked: string[] | null = null;
  const ranks = () => {
    if (ranked === null) ranked = powerRankings(games);
    return ranked;
  };
  const present = GROUP_ORDER[league].filter(code => teams.some(t => t.group === code));
  const groups = present.map(group => {
    const { order, notes } = orderTeams([...recs.values()].filter(r => r.group === group), { conference: league === 'fba', ranks });
    return { group, rows: toRows(league, order, len), notes };
  });
  let lottery: StandingRow[] = [];
  if (league === 'fba') {
    const outside = groups.flatMap(g => g.rows.slice(PLAYOFF_SEEDS).map(r => recs.get(r.teamId)!));
    const worstFirst = javaOrder(outside, better, true);
    const byId = new Map(groups.flatMap(g => g.rows).map(r => [r.teamId, r]));
    lottery = worstFirst.map((r, i) => ({ ...byId.get(r.teamId)!, seed: i + 1 }));
  }
  return { groups, lottery };
}
