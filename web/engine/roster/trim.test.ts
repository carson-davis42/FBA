import { describe, expect, it } from 'vitest';
import type { Position, RosterEntry } from '../shared/types';
import { baseState } from './testFixtures';
import { duplicateSpots, trimTeams } from './trim';

const e = (position: Position, playerId: string | null, contractEnd: number | null, restricted?: boolean): RosterEntry => (
  { playerId, position, rating: 70, age: 25, points: 0, contractEnd, contractAmount: 2, ...(restricted ? { restricted: true } : {}) }
);

describe('duplicateSpots', () => {
  it('flags a position held twice by players under contract', () => {
    const spots = duplicateSpots([e('PG', 'a', 82), e('PG', 'b', 80, true), e('SG', 'c', 82)], 80);
    expect(spots.map(s => [s.position, s.holders.map(h => h.playerId), s.expiring.length])).toEqual([['PG', ['a', 'b'], 0]]);
  });
  it('does not count a player whose contract has ended, and lists him as testing free agency', () => {
    // a veteran with an ended contract and a new rookie at the same position: nothing to trim.
    expect(duplicateSpots([e('PG', 'vet', 79), e('PG', 'rookie', 81, true)], 80)).toEqual([]);
    // two under contract plus one ended: the ended one is listed but cannot be cut.
    const spots = duplicateSpots([e('PG', 'vet', 79), e('PG', 'a', 82), e('PG', 'b', 81)], 80);
    expect(spots[0].holders.map(h => h.playerId)).toEqual(['a', 'b']);
    expect(spots[0].expiring.map(h => h.playerId)).toEqual(['vet']);
  });
  it('counts an ended rookie contract as holding the spot, since it is a team option', () => {
    expect(duplicateSpots([e('PG', 'r', 79, true), e('PG', 'a', 82)], 80)).toHaveLength(1);
  });
  it('ignores empty slots', () => {
    expect(duplicateSpots([e('PG', null, null), e('PG', 'a', 82)], 80)).toEqual([]);
  });
});

describe('trimTeams', () => {
  it('lists only the teams with a duplicate', () => {
    const s = baseState();
    s.fba.teams.CAR = [...s.fba.teams.CAR, e('PG', 'x', 82)];
    expect(trimTeams(s).map(t => [t.teamId, t.spots.map(x => x.position)])).toEqual([['CAR', ['PG']]]);
  });
});
