import type { Position, RosterEntry } from '../shared/types';
import { isExpired, POSITIONS } from './rules';
import { nameOf, type RosterState } from './state';

export type MarketType = 'FA' | 'Rookie' | 'D2' | 'Expired';

export interface MarketRow {
  playerId: string;
  name: string;
  position: Position;
  age: number | null;
  rating: number | null;
  scale: 'FBA' | 'D2';
  type: MarketType;
  from: string | null;
}

export function marketRows(state: RosterState): MarketRow[] {
  const rows: MarketRow[] = [];
  for (const fa of state.freeAgents.players) {
    rows.push({ playerId: fa.playerId, name: nameOf(state, fa.playerId), position: fa.position, age: fa.age, rating: fa.rating, scale: 'FBA', type: fa.rookie ? 'Rookie' : 'FA', from: null });
  }
  for (const [teamId, entries] of Object.entries(state.fba.teams)) {
    for (const e of entries) {
      if (isExpired(e, state.season) && !e.restricted) {
        rows.push({ playerId: e.playerId!, name: nameOf(state, e.playerId!), position: e.position, age: e.age, rating: e.rating, scale: 'FBA', type: 'Expired', from: teamId });
      }
    }
  }
  for (const [teamId, entries] of Object.entries(state.d2.teams)) {
    for (const e of entries) {
      if (e.playerId) rows.push({ playerId: e.playerId, name: nameOf(state, e.playerId), position: e.position, age: e.age, rating: e.rating, scale: 'D2', type: 'D2', from: teamId });
    }
  }
  const rank = (r: MarketRow) => (r.scale === 'FBA' ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
}

export function openPositions(entries: RosterEntry[]): Position[] {
  return POSITIONS.filter(pos => !entries.some(e => e.position === pos && e.playerId !== null));
}
