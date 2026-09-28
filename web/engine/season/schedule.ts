import type { Rng } from '../d2/random';
import type { ScheduleGame, SchedulePause } from '../shared/types';

export type SeasonLeague = 'fba' | 'fbad2';

export interface ScheduleTeamInfo { teamId: string; group: string | null }

/** Home games against each opponent (the same number away). FBA: 2+2 in-conference, 1+1 cross; D2: 1+1 in-league only. */
export const PAIRINGS: Record<SeasonLeague, { sameGroup: number; otherGroup: number }> = {
  fba: { sameGroup: 2, otherGroup: 1 },
  fbad2: { sameGroup: 1, otherGroup: 0 },
};

interface Slot {
  teamId: string;
  left: number;
  homeLeft: number;
  awayLeft: number;
  home: Map<string, number>;
  away: Map<string, number>;
}

const total = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);

function take(map: Map<string, number>, key: string): void {
  const n = (map.get(key) ?? 0) - 1;
  if (n > 0) map.set(key, n);
  else map.delete(key);
}

function pickKey(map: Map<string, number>, rng: Rng): string {
  const keys = [...map.keys()];
  return keys[Math.floor(rng() * keys.length)];
}

/**
 * Port of Java makeSchedule/ScheduleTeam: repeatedly take a team with the most games left (random among ties),
 * flip for home/away (forced when one side is used up), and pick a random remaining opponent for that side.
 */
export function buildSchedule(league: SeasonLeague, teams: ScheduleTeamInfo[], rng: Rng): ScheduleGame[] {
  const { sameGroup, otherGroup } = PAIRINGS[league];
  const slots = new Map<string, Slot>();
  for (const t of teams) {
    const home = new Map<string, number>();
    const away = new Map<string, number>();
    for (const o of teams) {
      if (o.teamId === t.teamId) continue;
      const n = o.group === t.group ? sameGroup : otherGroup;
      if (n > 0) {
        home.set(o.teamId, n);
        away.set(o.teamId, n);
      }
    }
    slots.set(t.teamId, { teamId: t.teamId, left: total(home) + total(away), homeLeft: total(home), awayLeft: total(away), home, away });
  }

  const games: ScheduleGame[] = [];
  for (;;) {
    let max = 0;
    for (const s of slots.values()) max = Math.max(max, s.left);
    if (max === 0) break;
    const tied = [...slots.values()].filter(s => s.left === max);
    const temp = tied[Math.floor(rng() * tied.length)];
    const coin = Math.floor(rng() * 2);
    const tempHome = temp.homeLeft === 0 ? false : temp.awayLeft === 0 ? true : coin === 0;
    const oppId = pickKey(tempHome ? temp.home : temp.away, rng);
    const opp = slots.get(oppId)!;
    if (tempHome) {
      take(temp.home, oppId);
      take(opp.away, temp.teamId);
      temp.homeLeft--;
      opp.awayLeft--;
      games.push({ gameNo: games.length + 1, home: temp.teamId, away: oppId });
    } else {
      take(temp.away, oppId);
      take(opp.home, temp.teamId);
      temp.awayLeft--;
      opp.homeLeft--;
      games.push({ gameNo: games.length + 1, home: oppId, away: temp.teamId });
    }
    temp.left--;
    opp.left--;
  }
  return games;
}

/** Packs games, in schedule order, into days where no team plays twice. */
export function gameDays(games: Pick<ScheduleGame, 'gameNo' | 'home' | 'away'>[]): number[][] {
  const days: number[][] = [];
  let current: number[] = [];
  const busy = new Set<string>();
  for (const g of games) {
    if (busy.has(g.home) || busy.has(g.away)) {
      days.push(current);
      current = [];
      busy.clear();
    }
    current.push(g.gameNo);
    busy.add(g.home);
    busy.add(g.away);
  }
  if (current.length) days.push(current);
  return days;
}

/** FBA pauses at the Java's integer quarter points; D2 has none. */
export function defaultPauses(league: SeasonLeague, totalGames: number): SchedulePause[] {
  if (league !== 'fba') return [];
  const q1 = Math.floor(totalGames / 4);
  const half = Math.floor(totalGames / 2);
  const q3 = Math.floor((totalGames * 3) / 4);
  return [
    { afterGame: q1, kind: 'ratings', done: false },
    { afterGame: half, kind: 'ratings', done: false },
    { afterGame: half, kind: 'deadline', done: false },
    { afterGame: q3, kind: 'ratings', done: false },
    { afterGame: q3, kind: 'allstar', done: false },
  ];
}
