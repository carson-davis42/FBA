import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';

export interface Column {
  label: string;
  value: (e: RosterEntry, name: string) => string;
  numeric?: boolean;
}

export function playerLabel(e: RosterEntry, players: Record<string, Player>): string {
  if (e.playerId === null) return e.rating === null ? 'Vacant' : 'Generated';
  return players[e.playerId]?.name ?? 'Unnamed';
}

export function formatContract(e: RosterEntry): string {
  if (e.contractEnd === null || e.contractEnd === undefined) return '—';
  return `S${e.contractEnd}` + (e.contractAmount === null || e.contractAmount === undefined ? '' : ` · $${e.contractAmount}`);
}

export function formatStars(e: RosterEntry): string {
  return e.stars ? '★'.repeat(e.stars) : '—';
}

export function teamRating(entries: RosterEntry[]): number | null {
  const ratings = entries.map(e => e.rating).filter((r): r is number => r !== null);
  return ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
}

const dash = (n: number | null) => (n === null ? '—' : String(n));

export function rosterColumns(league: LeagueId): Column[] {
  const pos: Column = { label: 'Pos', value: e => e.position };
  const player: Column = { label: 'Player', value: (_e, name) => name };
  const age: Column = { label: 'Age', value: e => dash(e.age), numeric: true };
  const rating: Column = { label: 'Rating', value: e => dash(e.rating), numeric: true };
  switch (league) {
    case 'fba':
      return [pos, player, age, rating, { label: 'Contract', value: formatContract }];
    case 'fbajc':
      return [pos, player, { label: 'Recruit', value: formatStars }, { label: 'Class', value: e => e.classYear ?? '—' }, rating];
    default:
      return [pos, player, age, rating];
  }
}
