import type { PlayersFile, RosterEntry, RostersFile } from '../shared/types';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/** 30 FBA teams T0–T29, five players each (ids p10000…); ratings spread 60–99; every third team's players are on rookie deals. */
export function allStarRosters(): { rosters: RostersFile; players: PlayersFile; teamIds: string[] } {
  const teams: Record<string, RosterEntry[]> = {};
  const names: PlayersFile['players'] = {};
  const teamIds: string[] = [];
  let id = 10000;
  for (let t = 0; t < 30; t++) {
    const teamId = `T${t}`;
    teamIds.push(teamId);
    teams[teamId] = POS.map((position, k) => {
      const playerId = `p${id++}`;
      names[playerId] = { id: playerId, name: `${teamId} ${position}`, birthSeason: null };
      const e: RosterEntry = { playerId, position, rating: 60 + ((t * 7 + k * 13) % 40), age: 24, points: 0, contractEnd: 80, contractAmount: 2 };
      if (t % 3 === 0) e.restricted = true;
      return e;
    });
  }
  return { rosters: { league: 'fba', season: 79, locked: false, teams }, players: { nextId: id, players: names }, teamIds };
}
