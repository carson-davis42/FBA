import type { LeagueId, PlayersFile, Position, ResultsFile, RostersFile } from './types';

export interface PlayerRow {
  playerId: string;
  name: string;
  teamId: string;
  position: Position;
  rating: number | null;
  age: number | null;
  gp: number;
  pts: number;
  ppg: number | null;
  /** FBA only, else null. */
  contractAmount: number | null;
  contractEnd: number | null;
  /** FBAJC only, else null. */
  classYear: string | null;
  stars: number | null;
}

export interface PlayerRowsInput {
  league: LeagueId;
  rosters: RostersFile;
  results: ResultsFile | null;
  players: PlayersFile;
}

/** One row per rostered player of the season: roster fields plus games and points from the season's box scores. Vacant slots are skipped; a repeated id counts once. */
export function playerRows({ league, rosters, results, players }: PlayerRowsInput): PlayerRow[] {
  const gp = new Map<string, number>();
  const pts = new Map<string, number>();
  for (const g of results?.games ?? []) {
    if (!g.box) continue;
    const seen = new Set<string>();
    for (const line of [...g.box.home, ...g.box.away]) {
      pts.set(line.playerId, (pts.get(line.playerId) ?? 0) + line.pts);
      if (!seen.has(line.playerId)) { seen.add(line.playerId); gp.set(line.playerId, (gp.get(line.playerId) ?? 0) + 1); }
    }
  }
  const done = new Set<string>();
  const rows: PlayerRow[] = [];
  for (const [teamId, entries] of Object.entries(rosters.teams)) {
    for (const e of entries) {
      if (e.playerId === null || done.has(e.playerId)) continue;
      done.add(e.playerId);
      const games = gp.get(e.playerId) ?? 0;
      const total = pts.get(e.playerId) ?? 0;
      rows.push({
        playerId: e.playerId,
        name: players.players[e.playerId]?.name ?? 'Unnamed',
        teamId,
        position: e.position,
        rating: e.rating,
        age: e.age,
        gp: games,
        pts: total,
        ppg: games > 0 ? total / games : null,
        contractAmount: league === 'fba' ? e.contractAmount ?? null : null,
        contractEnd: league === 'fba' ? e.contractEnd ?? null : null,
        classYear: league === 'fbajc' ? e.classYear ?? null : null,
        stars: league === 'fbajc' ? e.stars ?? null : null,
      });
    }
  }
  return rows;
}
