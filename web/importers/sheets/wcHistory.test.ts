import { describe, expect, it } from 'vitest';
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
});
