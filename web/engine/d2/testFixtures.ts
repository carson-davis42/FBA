import type { RosterEntry } from '../shared/types';
import type { D2State } from './state';

const e = (playerId: string | null, position: RosterEntry['position'], rating: number | null, age: number | null, points = 0): RosterEntry =>
  ({ playerId, position, rating, age, points });

const NAMES: Record<string, string> = {
  p00020: 'Ben Montgomery', p00021: 'Brooks Burrows', p00022: 'Jamal Edwards', p00023: 'Maddox Dean',
  p00025: 'Milo Dean', p00026: 'Jalil Grant', p00027: 'Adrian Grant', p00028: 'Xavier Booker',
  p00040: 'Kris Dyer', p00041: 'Kyron Smart', p00042: 'Myron Mason', p00043: 'Adrian Napoletani', p00044: 'Brycen Holcomb',
};

/**
 * S79 D2 right after FBA free agency closed, before the ratings reset.
 * - AMS: full except C is vacant.
 * - BER: SG is vacant.
 * - Reserves (all unrated): PG Kris Dyer (30), SG Kyron Smart (23, from FBA free agency),
 *   PF Myron Mason (25), SG Adrian Napoletani (27), C Brycen Holcomb (26).
 * - prevD2 is S78 with season point totals.
 */
export function d2BaseState(): D2State {
  return {
    season: 79,
    d2: {
      league: 'fbad2', season: 79, locked: false, teams: {
        AMS: [e('p00020', 'PG', 75, 30), e('p00021', 'SG', 72, 26), e('p00022', 'SF', 75, 27), e('p00023', 'PF', 94, 22), e(null, 'C', null, null)],
        BER: [e('p00025', 'PG', 70, 24), e(null, 'SG', null, null), e('p00026', 'SF', 80, 28), e('p00027', 'PF', 68, 31), e('p00028', 'C', 85, 29)],
      },
    },
    reserves: {
      league: 'fbad2', season: 79, locked: false, players: [
        { playerId: 'p00040', position: 'PG', age: 30, rating: null },
        { playerId: 'p00041', position: 'SG', age: 23, rating: null, fromFba: true },
        { playerId: 'p00042', position: 'PF', age: 25, rating: null },
        { playerId: 'p00043', position: 'SG', age: 27, rating: null },
        { playerId: 'p00044', position: 'C', age: 26, rating: null },
      ],
    },
    d2Tx: { league: 'fbad2', season: 79, entries: [] },
    players: { nextId: 45, players: Object.fromEntries(Object.entries(NAMES).map(([id, name]) => [id, { id, name, birthSeason: null }])) },
    calendar: {
      season: 79, steps: [
        { id: 'free-agency-offseason', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: true },
        { id: 'fbad2-ratings-reset', label: 'FBAD2 Ratings(reset)', kind: 'offseason', league: null, sub: true, done: false },
        { id: 'fbad2-draft', label: 'FBAD2 Draft', kind: 'offseason', league: null, sub: false, done: false },
      ],
    },
    prevD2: {
      league: 'fbad2', season: 78, locked: true, teams: {
        AMS: [e('p00020', 'PG', 75, 29, 300), e('p00021', 'SG', 72, 25, 300), e('p00022', 'SF', 75, 26, 300), e('p00023', 'PF', 94, 21, 700), e('p00024', 'C', 79, 24, 0)],
        BER: [e('p00025', 'PG', 70, 23, 300), e('p00029', 'SG', 70, 25, 300), e('p00026', 'SF', 80, 27, 300), e('p00027', 'PF', 68, 30, 300), e('p00028', 'C', 85, 28, 300)],
      },
    },
    freeAgencyClosed: true,
    ratings: null,
    pool: null,
    draft: null,
  };
}
