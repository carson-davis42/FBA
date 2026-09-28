import type { AllStarFile, PlayersFile, Position, RostersFile } from '../shared/types';

export interface FbaPlayer {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  restricted: boolean;
  name: string;
}

/** Every rated player on an FBA roster, team by team in slot order. */
export function fbaPlayers(rosters: RostersFile, players: PlayersFile): FbaPlayer[] {
  return Object.entries(rosters.teams).flatMap(([teamId, entries]) =>
    entries.filter(e => e.playerId !== null && e.rating !== null).map(e => ({
      playerId: e.playerId!,
      teamId,
      position: e.position,
      rating: e.rating!,
      restricted: e.restricted === true,
      name: players.players[e.playerId!]?.name ?? 'Unnamed',
    })));
}

export type AllStarResult = { ok: true; doc: AllStarFile; label: string } | { ok: false; problems: string[] };
export const allStarFail = (problems: string[]): AllStarResult => ({ ok: false, problems });

export function emptyAllStar(season: number): AllStarFile {
  return {
    league: 'fba', season, locked: false, selections: null, asgDraft: null, contestDraw: null,
    fivePoint: null, dunk: null, ysgDraft: null, ysg: null, asg: null,
  };
}
