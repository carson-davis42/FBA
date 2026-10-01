import { describe, expect, it } from 'vitest';
import { Report } from '../report';
import { parseWorldCups } from './wcHistory';

describe('parseWorldCups', () => {
  it('reads played and upcoming rows, treating X and blanks as none', () => {
    const rows = [
      ['Year', 'Host City', 'Host Country', 'Champions', 'Runner-Up', 'Tournament MVP', 'Date'],
      ['S56', 'San Jose', 'USA', 'Italy', 'Turkey', "Ignazio D'Angelo", 'X'],
      ['S80', 'Mumbai', 'India'],
      ['S82', 'London', 'England', '', '', '', ''],
      ['Notes'],
    ];
    expect(parseWorldCups(rows)).toEqual([
      { season: 56, city: 'San Jose', country: 'USA', champion: 'Italy', runnerUp: 'Turkey', mvp: "Ignazio D'Angelo" },
      { season: 80, city: 'Mumbai', country: 'India', champion: null, runnerUp: null, mvp: null },
      { season: 82, city: 'London', country: 'England', champion: null, runnerUp: null, mvp: null },
    ]);
  });

  it('reports a row with a blank host instead of dropping it silently', () => {
    const report = new Report();
    expect(parseWorldCups([['S60', 'X', '', 'Italy', 'Turkey']], report)).toEqual([]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('S60'))).toBe(true);
  });
});
