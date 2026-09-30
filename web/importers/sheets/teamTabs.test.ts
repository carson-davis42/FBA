import { describe, expect, it } from 'vitest';
import { parseTeamTabCounts } from './teamTabs';

describe('parseTeamTabCounts', () => {
  it('reads the counts under each header', () => {
    const rows = [
      ['Team Info', 'Championships', 'C-Ship app.', 'Conference Titles', 'FBA Tourny app.', "MVP's", 'PPK Award', 'LP Award', 'MC Award', "DPOY's", "MIP's", "ROTY's", 'Hall of Famers'],
      ['', '8', '16', '13', '18', '11', '2', '2', '6', '2', '0', '4', '15'],
    ];
    expect(parseTeamTabCounts(rows)).toEqual({ championships: 8, finals: 16, confTitles: 13, tournaments: 18, MVP: 11, PPK: 2, LP: 2, MC: 6, DPOY: 2, MIP: 0, ROTY: 4, hallOfFamers: 15 });
  });
  it('returns null without the header row', () => {
    expect(parseTeamTabCounts([['x']])).toBeNull();
  });
});
