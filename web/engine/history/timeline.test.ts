import { describe, expect, it } from 'vitest';
import type { EventsFile, FranchisesFile, SummaryFile } from '../shared/types';
import { buildTimeline } from './timeline';

const summary = (season: number, champion: string, teamId?: string): SummaryFile => ({
  league: 'fba', season, locked: true, host: null,
  champions: [{ title: 'FBA Champion', champion, ...(teamId ? { teamId } : {}) } as never],
});
const era = (name: string, from: number, to: number | null) => ({ name, abbr: 'XXX', city: 'X', from, to });
const franchises: FranchisesFile = {
  franchises: [
    { teamId: 'SEA', eras: [era('Seattle Shock', 59, null)] },
    { teamId: 'NO', eras: [era('New Orleans Seminoles', 57, null), era('Cypress Black Sox', 1, 56)] },
  ],
};
const events: EventsFile = { before: [{ label: 'Pre', notes: ['x'] }], seasons: [{ season: 59, notes: [], rules: ['Draft every season'] }] };

describe('buildTimeline', () => {
  const t = buildTimeline([summary(20, 'Old Champs', 'NO'), summary(59, 'Seattle Shock', 'SEA')], franchises, events);
  it('is newest first and includes derived seasons', () => {
    expect(t.map(s => s.season)).toEqual([59, 57, 20]);
  });
  it('finds expansions, renames, rules and champions', () => {
    expect(t[0].expansions).toEqual([{ teamId: 'SEA', name: 'Seattle Shock' }]);
    expect(t[0].rules).toEqual(['Draft every season']);
    expect(t[0].champion).toEqual({ name: 'Seattle Shock', teamId: 'SEA' });
    expect(t[1].renames).toEqual([{ teamId: 'NO', from: 'Cypress Black Sox', to: 'New Orleans Seminoles' }]);
    expect(t[1].champion).toBeNull();
  });
  it('works without franchises or events', () => {
    expect(buildTimeline([summary(3, 'A')], null, null).map(s => s.season)).toEqual([3]);
  });
});
