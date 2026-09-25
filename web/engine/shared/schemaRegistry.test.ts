import { describe, expect, it } from 'vitest';
import { schemaForPath } from './schemaRegistry';

describe('schemaForPath', () => {
  it.each([
    'players.json', 'meta.json', 'calendar.json', 'logos/manifest.json',
    'leagues/fba/teams.json', 'leagues/fbajc/S78/rosters.json',
    'leagues/fbad2/S78/summary.json', 'leagues/fba/S78/results.json',
  ])('knows %s', rel => {
    expect(schemaForPath(rel)).not.toBeNull();
  });

  it.each([
    '../secrets.json', 'leagues/nba/teams.json', 'leagues/fba/S78/../../x.json',
    'leagues/fba/78/rosters.json', 'players.json/extra', '', 'leagues/fba/teams9json',
  ])('refuses %s', rel => {
    expect(schemaForPath(rel)).toBeNull();
  });
});
