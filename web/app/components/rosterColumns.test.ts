import { describe, expect, it } from 'vitest';
import type { RosterEntry } from '../../engine/shared/types';
import { formatContract, formatStars, playerLabel, rosterColumns, teamRating } from './rosterColumns';

const e = (over: Partial<RosterEntry>): RosterEntry => ({ playerId: 'p00001', position: 'PG', rating: 90, age: 25, points: 0, ...over });

describe('roster helpers', () => {
  it('labels players, vacancies, and unnamed players', () => {
    const players = { p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 51 }, p00002: { id: 'p00002', name: null, birthSeason: null } };
    expect(playerLabel(e({}), players)).toBe('Gabriel Greenwood');
    expect(playerLabel(e({ playerId: null, rating: null }), players)).toBe('Vacant');
    expect(playerLabel(e({ playerId: null }), players)).toBe('Generated');
    expect(playerLabel(e({ playerId: 'p00002' }), players)).toBe('Unnamed');
  });
  it('formats contracts and stars', () => {
    expect(formatContract(e({ contractEnd: 81, contractAmount: 6 }))).toBe('S81 · $6');
    expect(formatContract(e({ contractEnd: null }))).toBe('—');
    expect(formatStars(e({ stars: 4 }))).toBe('★★★★');
    expect(formatStars(e({ stars: null }))).toBe('—');
  });
  it('averages known ratings', () => {
    expect(teamRating([e({ rating: 90 }), e({ rating: 81 }), e({ rating: null })])).toBe(86);
    expect(teamRating([e({ rating: null })])).toBeNull();
  });
  it('picks columns per league', () => {
    expect(rosterColumns('fba').map(c => c.label)).toEqual(['Pos', 'Player', 'Age', 'Rating', 'Contract']);
    expect(rosterColumns('fbajc').map(c => c.label)).toEqual(['Pos', 'Player', 'Recruit', 'Class', 'Rating']);
    expect(rosterColumns('fbad2').map(c => c.label)).toEqual(['Pos', 'Player', 'Age', 'Rating']);
  });
});
