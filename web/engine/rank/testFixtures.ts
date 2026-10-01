import type { Position, RankingFile, RankingRow } from '../shared/types';
import type { NameOf } from './ranking';

export const RANK_NAMES: Record<string, string> = {
  p00001: 'Ada Stone', p00002: 'Ben Cole', p00003: 'Cal Reyes', p00004: 'Dev Hart', p00005: 'Eli Park', p00006: 'Finn Lowe',
};

export const rankName: NameOf = id => RANK_NAMES[id] ?? id;

const row = (playerId: string, prevRating: number | null, otherRating: number | null, position: Position): RankingRow =>
  ({ playerId, position, age: 25, team: prevRating === null ? null : 'AMS', prevRating, otherRating, stat: prevRating === null ? null : '300 pts' });

/**
 * Six players, nobody ranked, curve 90 · 85 · 80:
 * Ada Stone PG 80 · Ben Cole SG 85 · Cal Reyes PG 80 · Dev Hart PG new (FBA 70) · Eli Park PG new · Finn Lowe C new (FBA 75).
 * Last season's order: Ben, Ada, Cal, then New: Finn, Dev, Eli.
 */
export function rankingDoc(patch: Partial<RankingFile> = {}): RankingFile {
  return {
    league: 'fbad2',
    season: 79,
    kind: 'd2-reset',
    locked: false,
    rows: [
      row('p00001', 80, null, 'PG'), row('p00002', 85, null, 'SG'), row('p00003', 80, null, 'PG'),
      row('p00004', null, 70, 'PG'), row('p00005', null, 60, 'PG'), row('p00006', null, 75, 'C'),
    ],
    order: [],
    ratings: {},
    curve: [90, 85, 80],
    ...patch,
  };
}
