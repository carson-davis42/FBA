import type { Team } from './types';

/** The FBA expansion: the season the teams first play. To rename a team before the "add teams" step has run, edit this file; afterwards `leagues/fba/teams.json` is the place. */
export const EXPANSION_SEASON = 80;
export const EXPANSION_PICKS_EACH = 4;
export const MAX_PROTECTED = 4;

export const EXPANSION_TEAMS: Team[] = [
  {
    teamId: 'PHI', name: 'Philly Phantoms', abbr: 'PHI', group: 'E', logoFolder: 'Philly Phantoms',
    badge: { bg: '#173C74', fg: '#ffffff', accent: '#D23434' }, fromSeason: EXPANSION_SEASON,
  },
  {
    // The Los Angeles Labradors are being reworked: a placeholder under their franchise id, with the generic FBA logo.
    teamId: 'LAL', name: 'Team 32', abbr: 'T32', group: 'W', logoFolder: 'FBA', logoFile: 'FBA_logo.png',
    badge: { bg: '#16346F', fg: '#ffffff', accent: '#C8102E' }, fromSeason: EXPANSION_SEASON,
  },
];

export const addTeamsStepId = (season: number) => `s${season}-add-expansion-teams`;
export const expansionDraftStepId = (season: number) => `s${season}-expansion-draft`;
