import { describe, expect, it } from 'vitest';
import { pathAgreementProblem, schemaForPath } from './schemaRegistry';

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
    'leagues/fba/S079/rosters.json',
  ])('refuses %s', rel => {
    expect(schemaForPath(rel)).toBeNull();
  });

  it('still resolves a season without leading zeros', () => {
    expect(schemaForPath('leagues/fba/S79/rosters.json')).not.toBeNull();
  });
});

describe('roster-move paths', () => {
  it.each([
    'leagues/fba/picks.json', 'leagues/fba/S79/freeAgents.json', 'leagues/fbad2/S79/reserves.json',
    'leagues/fba/S79/transactions.json', 'leagues/fbad2/S79/transactions.json',
  ])('knows %s', rel => {
    expect(schemaForPath(rel)).not.toBeNull();
  });

  it.each(['leagues/fbad2/picks.json', 'leagues/fbad2/S79/freeAgents.json', 'leagues/fba/S79/reserves.json'])('refuses %s', rel => {
    expect(schemaForPath(rel)).toBeNull();
  });
});

describe('pathAgreementProblem', () => {
  it('accepts matching league and season', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fba', season: 79 })).toBeNull();
    expect(pathAgreementProblem('leagues/fba/teams.json', { league: 'fba', teams: [] })).toBeNull();
    expect(pathAgreementProblem('players.json', { nextId: 1, players: {} })).toBeNull();
  });
  it('flags a league mismatch', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fbad2', season: 79 })).toMatch(/league/);
  });
  it('flags a season mismatch', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fba', season: 12 })).toMatch(/season/);
  });
});
