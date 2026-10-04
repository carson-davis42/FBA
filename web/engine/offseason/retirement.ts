import { normalizeRoster, RETIRE_AGE } from '../roster/rules';
import { appendTx, docPath, nameOf, withTeam, type DocKey, type MoveContext, type RosterState } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, Position, RostersFile } from '../shared/types';

/** Players this age or older retire automatically. */
export { RETIRE_AGE } from '../roster/rules';
export const RETIREMENT_STEP = 'retirement';

export interface Retiree { playerId: string; name: string; league: 'fba' | 'fbad2'; teamId: string | null; position: Position; age: number | null }
export interface RetireState extends RosterState { calendar: CalendarFile }

/** Everyone on an FBA roster, a D2 roster or D2 Reserves. Age is the season minus the birth season (null when unknown). */
export function retirementPool(state: RosterState): Retiree[] {
  const out: Retiree[] = [];
  const add = (playerId: string | null, league: 'fba' | 'fbad2', teamId: string | null, position: Position) => {
    if (playerId === null) return;
    const birth = state.players.players[playerId]?.birthSeason ?? null;
    out.push({ playerId, name: nameOf(state, playerId), league, teamId, position, age: birth === null ? null : state.season - birth });
  };
  for (const [teamId, entries] of Object.entries(state.fba.teams)) for (const e of entries) add(e.playerId, 'fba', teamId, e.position);
  for (const [teamId, entries] of Object.entries(state.d2.teams)) for (const e of entries) add(e.playerId, 'fbad2', teamId, e.position);
  for (const p of state.reserves.players) add(p.playerId, 'fbad2', null, p.position);
  return out;
}

export const autoRetirees = (pool: Retiree[]): Retiree[] => pool.filter(r => r.age !== null && r.age >= RETIRE_AGE);
export const unknownAges = (pool: Retiree[]): Retiree[] => pool.filter(r => r.age === null);

/**
 * Retires everyone at RETIRE_AGE or older plus the `early` ids. Gated on the calendar step only: this is the one
 * move that ignores roster locks, and every other move stays locked.
 */
export function retirePlayers(state: RetireState, early: string[], ctx: MoveContext): WritesResult {
  const step = calendarProblem(state.calendar, RETIREMENT_STEP, 'Players retire');
  if (step) return { ok: false, problems: [step] };
  const pool = retirementPool(state);
  const known = new Set(pool.map(r => r.playerId));
  const unknown = [...new Set(early)].filter(id => !known.has(id));
  if (unknown.length) return { ok: false, problems: unknown.map(id => `${id} is not on a pro roster or Reserves`) };
  const chosen = new Set([...autoRetirees(pool).map(r => r.playerId), ...early]);
  const retirees = pool.filter(r => chosen.has(r.playerId));

  const docs = new Map<DocKey, unknown>();
  const dropFrom = (rosters: RostersFile, league: 'fba' | 'fbad2'): RostersFile => {
    let out = rosters;
    for (const [teamId, entries] of Object.entries(rosters.teams)) {
      if (!entries.some(e => e.playerId !== null && chosen.has(e.playerId))) continue;
      out = withTeam(out, teamId, normalizeRoster(entries.filter(e => e.playerId === null || !chosen.has(e.playerId)), league));
    }
    return out;
  };
  if (retirees.some(r => r.league === 'fba')) docs.set('fba', dropFrom(state.fba, 'fba'));
  if (retirees.some(r => r.league === 'fbad2' && r.teamId !== null)) docs.set('d2', dropFrom(state.d2, 'fbad2'));
  if (retirees.some(r => r.teamId === null)) docs.set('reserves', { ...state.reserves, players: state.reserves.players.filter(p => !chosen.has(p.playerId)) });

  const players = { ...state.players.players };
  for (const r of retirees) {
    if (players[r.playerId]) players[r.playerId] = { ...players[r.playerId], retired: { season: state.season, league: r.league, teamId: r.teamId, position: r.position } };
  }
  if (retirees.length) docs.set('players', { ...state.players, players });

  for (const [league, key] of [['fba', 'fbaTx'], ['fbad2', 'd2Tx']] as const) {
    const mine = retirees.filter(r => r.league === league);
    if (!mine.length) continue;
    const teams = [...new Set(mine.map(r => r.teamId).filter((t): t is string => t !== null))];
    const lines = mine.map(r => `Retired ${r.position}-${r.name} (${r.teamId ?? 'Reserves'}${r.age === null ? '' : `, age ${r.age}`})`);
    docs.set(key, appendTx(state[key], ctx, 'retired', teams, lines));
  }

  const k = retirees.length;
  return {
    ok: true,
    label: k === 0 ? 'Retirement: no one retired' : `Retirement: ${k} ${k === 1 ? 'player' : 'players'} retired`,
    writes: [
      ...[...docs].map(([key, doc]) => ({ path: docPath(key, state.season), doc })),
      { path: 'calendar.json', doc: markStepDone(state.calendar, RETIREMENT_STEP) },
    ],
  };
}
