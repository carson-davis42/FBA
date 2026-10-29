import { describe, expect, it } from 'vitest';
import type { Position, RosterEntry } from '../shared/types';
import { baseState } from './testFixtures';
import { trimCandidates, trimTeams } from './trim';

const e = (position: Position, playerId: string | null, contractEnd: number | null, restricted?: boolean, rating = 70): RosterEntry => (
  { playerId, position, rating, age: 25, points: 0, contractEnd, contractAmount: 2, ...(restricted ? { restricted: true } : {}) }
);
const ids = (rows: { entry: RosterEntry }[]) => rows.map(r => r.entry.playerId);

describe('trimCandidates', () => {
  it('lists both players of a position held twice by players under contract', () => {
    const t = trimCandidates([e('PG', 'a', 82), e('PG', 'b', 80, true), e('SG', 'c', 82)], 80);
    expect(t.rows.map(r => [r.entry.playerId, r.reasons])).toEqual([['a', ['duplicate']], ['b', ['duplicate']]]);
    expect(t.expiring).toEqual([]);
  });
  it('does not count a player whose contract has ended, and lists him as testing free agency', () => {
    // a veteran with an ended contract and a new rookie at the same position: nothing to trim.
    expect(trimCandidates([e('PG', 'vet', 79), e('PG', 'rookie', 81, true)], 80).rows).toEqual([]);
    // two under contract plus one ended: the ended one is listed but cannot be cut.
    const t = trimCandidates([e('PG', 'vet', 79), e('PG', 'a', 82), e('PG', 'b', 81)], 80);
    expect(ids(t.rows)).toEqual(['a', 'b']);
    expect(ids(t.expiring)).toEqual(['vet']);
    expect(t.expiring[0].replacedBy?.playerId).toBe('a');
  });
  it('lists every ended contract, with nobody replacing him when he is alone at his position', () => {
    const t = trimCandidates([e('PG', 'vet', 79), e('SG', 'c', 82)], 80);
    expect(t.rows).toEqual([]);
    expect(t.expiring.map(x => [x.entry.playerId, x.replacedBy])).toEqual([['vet', null]]);
  });
  it('counts an ended rookie contract as holding the spot, since it is a team option', () => {
    expect(trimCandidates([e('PG', 'r', 79, true), e('PG', 'a', 82)], 80).rows).toHaveLength(2);
  });
  it('ignores empty slots', () => {
    expect(trimCandidates([e('PG', null, null), e('PG', 'a', 82)], 80).rows).toEqual([]);
  });
  it('offers a rookie rated 65 or lower even with no duplicate, and tags a duplicate who is also one with both reasons', () => {
    const t = trimCandidates([e('PG', 'low', 81, true, 65), e('SG', 'ok', 81, true, 66), e('SF', 'vet', 82, false, 50), e('PF', 'x', 82), e('PF', 'lowdup', 81, true, 60)], 80);
    expect(t.rows.map(r => [r.entry.playerId, r.reasons])).toEqual([['low', ['low-rookie']], ['x', ['duplicate']], ['lowdup', ['duplicate', 'low-rookie']]]);
  });
  it('skips an unrated rookie', () => {
    expect(trimCandidates([{ ...e('PG', 'u', 81, true), rating: null }], 80).rows).toEqual([]);
  });
});

describe('trimTeams', () => {
  it('lists only the teams with someone to cut or release', () => {
    const s = baseState();
    s.fba.teams.CAR = [...s.fba.teams.CAR, e('PG', 'x', 82)];
    // BOS has two ended contracts (nothing to cut); CAR has a duplicate; MON has neither.
    expect(trimTeams(s).map(t => [t.teamId, ids(t.rows), ids(t.expiring)])).toEqual([['BOS', [], ['p00003', 'p00004']], ['CAR', ['p00006', 'x'], []]]);
  });
});
