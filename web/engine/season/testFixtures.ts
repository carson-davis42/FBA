import { mulberry32 } from '../d2/random';
import type { RosterEntry, TeamsFile } from '../shared/types';
import { buildSchedule, defaultPauses, type SeasonLeague } from './schedule';
import type { SeasonState } from './state';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };

function teamsFile(league: SeasonLeague, list: [string, string][]): TeamsFile {
  return { league, teams: list.map(([teamId, group]) => ({ teamId, name: `${teamId} Club`, abbr: teamId, group, logoFolder: null, badge })) };
}

function rosters(league: SeasonLeague, ratings: Record<string, number[]>, firstId: number) {
  let id = firstId;
  const names: Record<string, { id: string; name: string; birthSeason: null }> = {};
  const teams: Record<string, RosterEntry[]> = {};
  for (const [teamId, rs] of Object.entries(ratings)) {
    teams[teamId] = rs.map((rating, k) => {
      const playerId = `p${String(id++).padStart(5, '0')}`;
      names[playerId] = { id: playerId, name: `${teamId} ${POS[k]}`, birthSeason: null };
      const e: RosterEntry = { playerId, position: POS[k], rating, age: 25, points: 0 };
      if (league === 'fba') {
        e.contractEnd = 80;
        e.contractAmount = 4;
      }
      return e;
    });
  }
  return { rosters: { league, season: 79, locked: false, teams }, names };
}

/** Sits at the given league's calendar step (D2 before FBA, per the real season order). */
const calendar = (league: SeasonLeague) => ({
  season: 79,
  steps: [
    { id: 'make-s79-schedules', label: 'Make S79 Schedules', kind: 'offseason' as const, league: null, sub: false, done: true },
    { id: 'fba-d2', label: 'FBA D2', kind: 'league' as const, league: 'fbad2' as const, sub: false, done: league === 'fba' },
    { id: 'fba', label: 'FBA', kind: 'league' as const, league: 'fba' as const, sub: false, done: false },
  ],
});

export function seasonStateFor(league: SeasonLeague, list: [string, string][], ratings: Record<string, number[]>, firstId: number): SeasonState {
  const teams = teamsFile(league, list);
  const r = rosters(league, ratings, firstId);
  const games = buildSchedule(league, teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), mulberry32(1));
  return {
    league,
    season: 79,
    teams,
    rosters: r.rosters,
    players: { nextId: firstId + Math.max(100, Object.keys(r.names).length), players: r.names },
    calendar: calendar(league),
    tx: { league, season: 79, entries: [] },
    schedule: { league, season: 79, locked: false, games, pauses: defaultPauses(league, games.length) },
    results: { league, season: 79, locked: false, games: [] },
    ratingPause: null,
    allstar: null,
    playoffs: null,
    awards: null,
    summary: null,
  };
}

/** Four FBA teams: 16 games; pauses after games 4 (ratings), 8 (ratings, deadline), 12 (ratings, allstar). */
export function fbaSeasonState(): SeasonState {
  return seasonStateFor('fba', [['BOS', 'E'], ['CAR', 'E'], ['DEN', 'W'], ['MEM', 'W']], {
    BOS: [95, 88, 90, 85, 94], CAR: [92, 80, 93, 77, 80], DEN: [85, 86, 95, 88, 90], MEM: [96, 84, 82, 91, 86],
  }, 1);
}

/** Four D2 teams in two leagues: 4 games, no pauses. */
export function d2SeasonState(): SeasonState {
  return seasonStateFor('fbad2', [['AMS', 'PL'], ['BER', 'PL'], ['LIS', 'WL'], ['MUN', 'WL']], {
    AMS: [75, 72, 75, 94, 79], BER: [70, 74, 80, 68, 85], LIS: [81, 77, 73, 70, 88], MUN: [79, 83, 71, 76, 74],
  }, 101);
}
