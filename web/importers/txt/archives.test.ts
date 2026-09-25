import { describe, expect, it } from 'vitest';
import { parseBracketFile, parseD2Playoffs, parseFbaPlayoffs, parseFbaResults, parseSeriesLine } from './archives';

describe('parseFbaResults', () => {
  it('parses game lines', () => {
    expect(parseFbaResults('1,Oakland All-Stars,79,Maine Wildcats,88\n2,DCB,82,Seattle Shock,105')).toEqual([
      { gameNo: 1, home: 'Oakland All-Stars', homePts: 79, away: 'Maine Wildcats', awayPts: 88 },
      { gameNo: 2, home: 'DCB', homePts: 82, away: 'Seattle Shock', awayPts: 105 },
    ]);
  });
  it('rejects malformed lines', () => {
    expect(() => parseFbaResults('1,Oakland,79')).toThrow(/Results line/);
  });
});

describe('parseSeriesLine', () => {
  it('handles hyphenated team names', () => {
    expect(parseSeriesLine('4-Oakland All-Stars vs Honolulu Rays-2')).toEqual({ a: 'Oakland All-Stars', aWins: 4, b: 'Honolulu Rays', bWins: 2 });
    expect(parseSeriesLine('1-Honolulu Rays vs Oakland All-Stars-4')).toEqual({ a: 'Honolulu Rays', aWins: 1, b: 'Oakland All-Stars', bWins: 4 });
  });
  it('returns null for other lines', () => {
    expect(parseSeriesLine('-Eastern-')).toBeNull();
  });
});

describe('parseFbaPlayoffs', () => {
  it('reads the finals winner', () => {
    const text = '--Conference Finals--\n-Eastern-\n4-Boston Bucks vs Cincinnati Blue Stripes-0\n\n--FBA Finals--\n4-Boston Bucks vs Memphis Blues-1\n\n\nNext Games:\n';
    expect(parseFbaPlayoffs(text)).toEqual({ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' });
  });
  it('handles the second team winning', () => {
    expect(parseFbaPlayoffs('--FBA Finals--\n2-Boston Bucks vs Memphis Blues-4')?.champion).toBe('Memphis Blues');
  });
  it('returns null for an unfinished finals', () => {
    expect(parseFbaPlayoffs('--FBA Finals--\n3-Boston Bucks vs Memphis Blues-2')).toBeNull();
  });
});

describe('parseD2Playoffs', () => {
  it('reads each league final', () => {
    const text = '--League Semi-Finals--\n-Premier League-\n4-Salzburg vs London-2\n\n--League Finals--\n-Premier League-\n4-Salzburg vs Zurich-1\n-International League-\n3-Naples vs Barcelona-4\n\n\nNext Games:\n';
    expect(parseD2Playoffs(text)).toEqual([
      { title: 'Premier League Champion', champion: 'Salzburg', runnerUp: 'Zurich', score: '4-1' },
      { title: 'International League Champion', champion: 'Barcelona', runnerUp: 'Naples', score: '4-3' },
    ]);
  });
});

describe('parseBracketFile', () => {
  it('reads a World Cup bracket with host', () => {
    const text = '     --S78 World Cup Croatia--\n--Region 1--\n   --National Championship--\n(2)Italy vs (1)Germany\n   --Champions--\nGermany\n';
    expect(parseBracketFile(text)).toEqual({ champion: 'Germany', runnerUp: 'Italy', host: 'Croatia' });
  });
  it('reads a March Madness bracket without host', () => {
    const text = '  --S78 March Madness--\n   --National Championship--\n(3)North Carolina vs (3)Syracuse\n   --Champions--\nNorth Carolina\n';
    expect(parseBracketFile(text)).toEqual({ champion: 'North Carolina', runnerUp: 'Syracuse', host: null });
  });
  it('returns nulls for an unfinished bracket', () => {
    expect(parseBracketFile('--S79 March Madness--\n--Region 1--\n')).toEqual({ champion: null, runnerUp: null, host: null });
  });
});
