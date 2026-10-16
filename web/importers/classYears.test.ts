import { describe, expect, it } from 'vitest';
import type { ClassYear, RosterEntry, RostersFile } from '../engine/shared/types';
import { repairClassYears } from './classYears';

const entry = (playerId: string | null, classYear: ClassYear | null): RosterEntry => ({ playerId, position: 'PG', rating: 80, age: null, points: 0, stars: null, classYear });
const rosters = (season: number, teams: Record<string, RosterEntry[]>): RostersFile => ({ league: 'fbajc', season, locked: false, teams });

describe('repairClassYears', () => {
  const prev = rosters(79, { ARIZ: [entry('pZain', 'Fr'), entry('pSoph', 'So'), entry('pSen', 'Sr')], DUKE: [entry('pJr', 'Jr')] });

  it('puts a returning player one class above last season: Zain, a Fr in S79, is a So in S80, not a Jr', () => {
    const cur = rosters(80, { ARIZ: [entry('pZain', 'Jr'), entry('pSoph', 'Jr')], DUKE: [entry('pJr', 'Sr')] });
    const r = repairClassYears(prev, cur);
    expect(r.changed).toEqual([{ playerId: 'pZain', teamId: 'ARIZ', from: 'Jr', to: 'So' }]);
    expect(r.rosters.teams.ARIZ[0].classYear).toBe('So');
    expect(r.rosters.teams.ARIZ[1].classYear).toBe('Jr');
  });
  it('follows a transfer to his new school, leaves recruits, holes and graduates alone, and does not change the input', () => {
    const cur = rosters(80, { DUKE: [entry('pSoph', 'Jr'), entry('pNew', 'Fr'), entry(null, null), entry('pSen', 'Sr')] });
    const copy = JSON.stringify(cur);
    const r = repairClassYears(prev, cur);
    expect(r.changed).toEqual([]);
    expect(r.rosters).toBe(cur);
    expect(JSON.stringify(cur)).toBe(copy);
  });
  it('changes nothing when every class is already right', () => {
    const cur = rosters(80, { ARIZ: [entry('pZain', 'So')] });
    expect(repairClassYears(prev, cur).changed).toEqual([]);
  });
});
