import { describe, expect, it } from 'vitest';
import { buildEvents, parseEventsTab } from './events';

describe('events', () => {
  const rows = [['FFL S19'], ['FFL S20', 'FFL Basketball Begins'], ['S1', 'FBA Begins'], ['S2'], ['S11', 'FBA JC S3', '']];
  it('keeps rows with notes', () => {
    expect(parseEventsTab(rows)).toEqual({
      before: [{ label: 'FFL S20', notes: ['FFL Basketball Begins'] }],
      seasons: [{ season: 1, notes: ['FBA Begins'] }, { season: 11, notes: ['FBA JC S3'] }],
    });
  });
  it('merges rules by season, ascending', () => {
    const doc = buildEvents(parseEventsTab(rows), [{ season: 59, lines: ['Draft every season'] }, { season: 1, lines: ['After 2OT it is a tie'] }]);
    expect(doc.seasons).toEqual([
      { season: 1, notes: ['FBA Begins'], rules: ['After 2OT it is a tie'] },
      { season: 11, notes: ['FBA JC S3'], rules: [] },
      { season: 59, notes: [], rules: ['Draft every season'] },
    ]);
  });
});
