import type { RosterEntry } from '../shared/types';
import type { RosterState } from './state';

const fba = (playerId: string | null, position: RosterEntry['position'], rating: number | null, age: number | null, contractEnd: number | null, contractAmount: number | null, restricted = false): RosterEntry => {
  const e: RosterEntry = { playerId, position, rating, age, points: 0, contractEnd, contractAmount };
  if (restricted) e.restricted = true;
  return e;
};
const d2 = (playerId: string | null, position: RosterEntry['position'], rating: number | null, age: number | null): RosterEntry =>
  ({ playerId, position, rating, age, points: 0 });

const NAMES: Record<string, string> = {
  p00001: 'Gabriel Greenwood', p00002: 'Yasin Milovanovic', p00003: "Koa'e Keano", p00004: 'Callan Schwangau', p00005: 'Olufemi Cisneros',
  p00006: 'Jelani Soweto', p00007: 'Terence Hopkins', p00008: 'Louis Pepperdash III', p00009: 'Kya Emery',
  p00010: 'Milo Lawrenz', p00011: 'Rick Moore', p00012: 'Dan Price', p00013: 'Tom Hale',
  p00020: 'Ben Montgomery', p00021: 'Brooks Burrows', p00022: 'Jamal Edwards', p00023: 'Maddox Dean', p00024: 'Rick King',
  p00030: 'Azubuike Okoro', p00031: 'Milan Tepic', p00032: 'Mubiru Okeke', p00040: 'Kris Dyer',
};

/**
 * S79 fixture.
 * - BOS payroll $23: SF Keano and PF Schwangau are expired (S78, unrestricted).
 * - CAR payroll $23, with the C slot vacant.
 * - MON payroll $6: SG is vacant, and PF Dan Price's S78 contract is expired and restricted.
 * - D2 has one team, AMS.
 */
export function baseState(): RosterState {
  return {
    season: 79,
    fba: {
      league: 'fba', season: 79, locked: false, teams: {
        BOS: [fba('p00001', 'PG', 95, 28, 80, 8), fba('p00002', 'SG', 88, 28, 81, 7), fba('p00003', 'SF', 67, 25, 78, 1), fba('p00004', 'PF', 68, 28, 78, 1), fba('p00005', 'C', 94, 27, 80, 8)],
        CAR: [fba('p00006', 'PG', 92, 24, 82, 8), fba('p00007', 'SG', 69, 28, 79, 1), fba('p00008', 'SF', 93, 23, 80, 7), fba('p00009', 'PF', 77, 29, 80, 7), fba(null, 'C', null, null, null, null)],
        MON: [fba('p00010', 'PG', 81, 19, 80, 2, true), fba(null, 'SG', null, null, null, null), fba('p00011', 'SF', 70, 30, 79, 1), fba('p00012', 'PF', 72, 23, 78, 2, true), fba('p00013', 'C', 75, 26, 80, 3)],
      },
    },
    d2: {
      league: 'fbad2', season: 79, locked: false, teams: {
        AMS: [d2('p00020', 'PG', 75, 30), d2('p00021', 'SG', 72, 26), d2('p00022', 'SF', 75, 27), d2('p00023', 'PF', 94, 22), d2('p00024', 'C', 79, 25)],
      },
    },
    freeAgents: {
      league: 'fba', season: 79, locked: false, players: [
        { playerId: 'p00030', position: 'C', age: 27, rating: 68, rookie: false, note: '' },
        { playerId: 'p00031', position: 'C', age: 22, rating: null, rookie: true, note: 'R' },
        { playerId: 'p00032', position: 'SF', age: 28, rating: 69, rookie: false, note: '' },
      ],
    },
    reserves: { league: 'fbad2', season: 79, locked: false, players: [{ playerId: 'p00040', position: 'PG', age: 30, rating: null }] },
    picks: { league: 'fba', obligations: [] },
    players: {
      nextId: 41,
      players: Object.fromEntries(Object.entries(NAMES).map(([id, name]) => [id, { id, name, birthSeason: null }])),
    },
    fbaTx: { league: 'fba', season: 79, entries: [] },
    d2Tx: { league: 'fbad2', season: 79, entries: [] },
  };
}
