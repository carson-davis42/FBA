import { describe, expect, it } from 'vitest';
import teams from '../../data/leagues/fbawc/teams.json';
import { WC_FLAGS } from './flags';

describe('WC_FLAGS', () => {
  it('maps every fbawc team id to a lowercase ISO code, with no code reused', () => {
    const ids = (teams as { teams: { teamId: string }[] }).teams.map(t => t.teamId);
    expect(ids.filter(id => !(id in WC_FLAGS))).toEqual([]);
    expect(Object.keys(WC_FLAGS).filter(id => !ids.includes(id))).toEqual([]);
    const codes = Object.values(WC_FLAGS);
    expect(codes.every(c => /^[a-z]{2}(-[a-z]{3})?$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
