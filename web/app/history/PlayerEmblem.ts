import type { Stint } from '../../engine/history/career';
import type { PlayerStatus } from '../../engine/history/career';
import { findSchool } from './CareerSection';
import { franchiseByAbbr } from '../../engine/shared/franchises';
import type { FranchisesFile, Team } from '../../engine/shared/types';

/** The league's own mark for a retired player: red, white and blue. */
export const FBA_EMBLEM: Team = { teamId: 'FBA', name: 'FBA', abbr: 'FBA', group: null, logoFolder: 'FBA', logoFile: 'FBA_logo.png', badge: { bg: '#16346F', fg: '#fff', accent: '#C8102E' } };
/** The gold version for the Hall of Fame (FBA Logos/FBA_Gold). */
export const HOF_EMBLEM: Team = { teamId: 'FBA', name: 'FBA Hall of Fame', abbr: 'HOF', group: null, logoFolder: 'FBA_Gold', logoFile: 'FBA_logo_gold.png', badge: { bg: '#8A5A0A', fg: '#fff', accent: '#FFE27A' } };

export interface EmblemTeams { fba: Team[]; d2: Team[]; college: Team[]; wc: Team[]; franchises?: FranchisesFile | null }

/** The last stint's team in the league that stint was in. */
function lastStintTeam(stint: Stint, teams: EmblemTeams): Team | undefined {
  if (stint.kind === 'fba') {
    const code = stint.team.split('/').pop()!;
    const season = typeof stint.to === 'number' ? stint.to : typeof stint.from === 'number' ? stint.from : 1;
    return teams.fba.find(t => t.teamId === (franchiseByAbbr(teams.franchises, code, season)?.teamId ?? code));
  }
  if (stint.kind === 'd2') return teams.d2.find(t => t.name === (/^D2\((.*)\)$/.exec(stint.team)?.[1] ?? stint.team));
  if (stint.kind === 'college') return findSchool(teams.college, stint.team);
  return teams.wc.find(t => t.name === (/^WC\((.*)\)$/.exec(stint.team)?.[1] ?? stint.team));
}

/**
 * The mark and colours a player page leads with: the gold FBA logo in the Hall of Fame, the FBA logo once retired, and otherwise the team he plays
 * for now (FBA team, D2 team, school or national team). `fallback` is the team a page would use anyway when the status gives none.
 */
export function playerEmblem(status: PlayerStatus, lastStint: Stint | undefined, teams: EmblemTeams, fallback: Team | undefined): Team | undefined {
  if (status === 'hof') return HOF_EMBLEM;
  if (status === 'retired') return FBA_EMBLEM;
  return (lastStint ? lastStintTeam(lastStint, teams) : undefined) ?? fallback;
}
