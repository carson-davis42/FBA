import type { QualifyingFile, WorldCupFile } from '../shared/types';
import { groupTable } from './worldcup';

export type WcClinch = 'qualified' | 'advanced' | 'eliminated';

/** Conservative, wins only (ties stay open): clinched when fewer than `cut` others can reach its wins, eliminated when `cut` others already have more than it can reach. */
function clinchTable(teams: string[], games: { home: string; away: string; homePts: number; awayPts: number }[], remaining: { home: string; away: string }[], cut: number, clinched: WcClinch): Record<string, WcClinch | null> {
  const set = new Set(teams);
  const w = new Map(teams.map(t => [t, 0]));
  const r = new Map(teams.map(t => [t, 0]));
  for (const g of games) {
    if (!set.has(g.home) || !set.has(g.away)) continue;
    const win = g.homePts > g.awayPts ? g.home : g.away;
    w.set(win, w.get(win)! + 1);
  }
  for (const g of remaining) {
    if (!set.has(g.home) || !set.has(g.away)) continue;
    r.set(g.home, r.get(g.home)! + 1);
    r.set(g.away, r.get(g.away)! + 1);
  }
  const out: Record<string, WcClinch | null> = {};
  for (const t of teams) {
    const mine = w.get(t)!;
    const max = mine + r.get(t)!;
    let reach = 0;
    let ahead = 0;
    for (const o of teams) {
      if (o === t) continue;
      if (w.get(o)! + r.get(o)! >= mine) reach++;
      if (w.get(o)! > max) ahead++;
    }
    out[t] = reach < cut ? clinched : ahead >= cut ? 'eliminated' : null;
  }
  return out;
}

export function qualifyingClinch(q: QualifyingFile): Record<string, WcClinch | null> {
  const out: Record<string, WcClinch | null> = {};
  for (const t of q.auto) out[t] = 'qualified';
  if (q.advanced.length > 0) {
    const adv = new Set(q.advanced);
    for (const t of q.field) out[t] = adv.has(t) ? 'qualified' : 'eliminated';
    return out;
  }
  return { ...out, ...clinchTable(q.field, q.games, q.schedule.slice(q.games.length), 49, 'qualified') };
}

export function groupClinch(wc: WorldCupFile, group: string): Record<string, WcClinch | null> {
  const teams = wc.groups[group];
  const set = new Set(teams);
  const remaining = wc.schedule.slice(wc.groupGames.length).filter(g => set.has(g.home) && set.has(g.away));
  if (remaining.length === 0) {
    const top = new Set(groupTable(wc, group).rows.slice(0, 2).map(x => x.teamId));
    return Object.fromEntries(teams.map(t => [t, top.has(t) ? 'advanced' : 'eliminated'] as const));
  }
  return clinchTable(teams, wc.groupGames, remaining, 2, 'advanced');
}
