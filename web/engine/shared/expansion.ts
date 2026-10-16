import type { Team } from './types';

/** The FBA expansion: the season the teams first play. To rename a team before the "add teams" step has run, edit this file; afterwards `leagues/fba/teams.json` is the place. */
export const EXPANSION_SEASON = 80;
export const EXPANSION_PICKS_EACH = 4;
export const MAX_PROTECTED = 4;

export const EXPANSION_TEAMS: Team[] = [
  {
    teamId: 'PHI', name: 'Philly Phantoms', abbr: 'PHI', group: 'E', logoFolder: 'Philly Phantoms',
    badge: { bg: '#0F2C78', fg: '#ffffff', accent: '#E4102B' }, fromSeason: EXPANSION_SEASON,
  },
  {
    // The Boise Raptors, under the Los Angeles Labradors' franchise id (the "Team 32" placeholder), with their own logo folder (the blue B) and colours.
    teamId: 'LAL', name: 'Boise Raptors', abbr: 'BOI', group: 'W', logoFolder: 'Boise Raptors',
    badge: { bg: '#0B4DC8', fg: '#ffffff', accent: '#0A1A52' }, fromSeason: EXPANSION_SEASON,
  },
];

export const addTeamsStepId = (season: number) => `s${season}-add-expansion-teams`;
export const expansionDraftStepId = (season: number) => `s${season}-expansion-draft`;
