import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { areNeighbours, cityRegion, collegeRegion } from './regions';

const data = (rel: string) => JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'data', rel), 'utf8'));

describe('regions', () => {
  it('knows the region of every college and every FBA franchise in the committed data', () => {
    const colleges = (data('leagues/fbajc/teams.json').teams as { name: string }[]).map(t => t.name);
    expect(colleges.filter(n => collegeRegion(n) === null)).toEqual([]);
    const cities = (data('leagues/fba/franchises.json').franchises as { teamId: string; eras: { city: string }[] }[]).map(f => [f.teamId, f.eras.at(-1)!.city]);
    expect(cities.filter(([, c]) => cityRegion(c) === null)).toEqual([]);
  });
  it('maps places to regions', () => {
    expect(collegeRegion('Duke')).toBe('Southeast');
    expect(collegeRegion('Michigan State')).toBe('Great Lakes');
    expect(collegeRegion('UCLA')).toBe('Pacific');
    expect(collegeRegion('Lousiville')).toBe('Southeast');
    expect(collegeRegion('Nowhere State')).toBeNull();
    expect(cityRegion('Honolulu, Hawaii')).toBe('Pacific');
    expect(cityRegion('Washington DC, USA')).toBe('Mid-Atlantic');
    expect(cityRegion('Toronto, Ontario, Canada')).toBe('Great Lakes');
    expect(cityRegion('Vancouver, BC, Canada')).toBe('Pacific');
    expect(cityRegion('Portland, Maine')).toBe('New England');
  });
  it('has neighbours both ways', () => {
    expect(areNeighbours('Pacific', 'Mountain')).toBe(true);
    expect(areNeighbours('Mountain', 'Pacific')).toBe(true);
    expect(areNeighbours('Pacific', 'New England')).toBe(false);
  });
});
