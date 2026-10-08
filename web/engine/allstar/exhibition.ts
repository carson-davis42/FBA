import type { Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import { replayPossessions, simRotationGame, type Rotation, type SimGame, type SimPlayer, type SimTeam } from '../season/sim';
import type { ExhibitionGame } from '../shared/types';

/** A side's whole roster in a fixed order; the lineups name players by their place in it. */
export type Roster = SimPlayer[];

/**
 * Plays one game on the FBA possession engine. `rosters` are every player each side can use, and `rotation[side][q]` is who plays quarter
 * q+1 as indexes into that roster (one entry keeps the same five all game); overtime always uses the first. `teams` are the event's team
 * numbers, home first.
 */
export function playExhibition(teams: [number, number], rosters: [Roster, Roster], rotation: [number[][], number[][]], rng: Rng): ExhibitionGame {
  const sim = simRotationGame(
    1,
    { teamId: String(teams[0]), players: rosters[0] },
    { teamId: String(teams[1]), players: rosters[1] },
    { home: rotation[0], away: rotation[1] },
    rng,
  );
  const periods = sim.periods.home.length;
  const idsAt = (side: 'home' | 'away', q: number) => {
    const quarters = side === 'home' ? rotation[0] : rotation[1];
    const idx = quarters[q <= 3 ? Math.min(q, quarters.length - 1) : 0];
    return idx.map(i => (side === 'home' ? rosters[0] : rosters[1])[i].playerId);
  };
  const points: Record<string, number>[] = Array.from({ length: periods }, () => ({}));
  for (const p of sim.possessions) {
    const id = rosters[p.offense === 'home' ? 0 : 1][p.handler].playerId;
    points[p.period - 1][id] = (points[p.period - 1][id] ?? 0) + p.points;
  }
  return {
    teams,
    rosters: [rosters[0].map(r => ({ ...r })), rosters[1].map(r => ({ ...r }))],
    lineups: Array.from({ length: periods }, (_, q) => [idsAt('home', q), idsAt('away', q)] as [string[], string[]]),
    plays: sim.possessions.map(p => [p.offense === 'home' ? 0 : 1, p.handler, p.defender, p.points]),
    points,
    scores: [sim.homePts, sim.awayPts],
    ot: sim.ot,
    winner: sim.homePts > sim.awayPts ? teams[0] : teams[1],
  };
}

/**
 * The saved game as a `SimGame` the live viewer can step through: the same possessions, with the rosters as the two teams.
 * `names` labels the sides (the viewer shows `teamId`).
 */
export function toSimGame(game: ExhibitionGame, names: [string, string]): SimGame {
  const team = (side: 0 | 1): SimTeam => ({ teamId: names[side], players: game.rosters[side].map(r => ({ ...r })) });
  const home = team(0);
  const away = team(1);
  const quarters = (side: 0 | 1) => game.lineups.slice(0, 4).map(l => l[side].map(id => game.rosters[side].findIndex(r => r.playerId === id)));
  const possessions = replayPossessions(game.plays);
  const periods = { home: [] as number[], away: [] as number[] };
  const box = { home: home.players.map(() => 0), away: away.players.map(() => 0) };
  for (const p of possessions) {
    while (periods.home.length < p.period) { periods.home.push(0); periods.away.push(0); }
    periods[p.offense][p.period - 1] += p.points;
    box[p.offense][p.handler] += p.points;
  }
  const rotation: Rotation = { home: quarters(0), away: quarters(1) };
  return { gameNo: 1, home, away, possessions, homePts: game.scores[0], awayPts: game.scores[1], ot: game.ot, periods, box, rotation };
}

/** Five players as a lineup: by position (PG to C), then in the order given, which is how the engine matches defenders. */
export function lineupOf(players: SimPlayer[]): SimPlayer[] {
  return [...players]
    .map((p, k) => ({ p, k }))
    .sort((a, b) => POSITIONS.indexOf(a.p.position) - POSITIONS.indexOf(b.p.position) || a.k - b.k)
    .map(x => x.p);
}

/** Points per player across `games`, for the players in `roster`. */
export function pointsFor(games: ExhibitionGame[], roster: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of games) for (const period of g.points) for (const [id, pts] of Object.entries(period)) if (roster.includes(id)) out.set(id, (out.get(id) ?? 0) + pts);
  return out;
}

/** The top scorer across `games` among the `roster` players who took the floor (no points counts as 0); a tie is a random pick among those tied. */
export function topScorer(games: ExhibitionGame[], roster: string[], rng: Rng): string {
  const pts = pointsFor(games, roster);
  const played = new Set(games.flatMap(g => g.lineups.flatMap(l => l.flat())));
  const eligible = roster.filter(id => played.has(id));
  const best = Math.max(...eligible.map(id => pts.get(id) ?? 0));
  const tied = eligible.filter(id => (pts.get(id) ?? 0) === best);
  return tied[Math.floor(rng() * tied.length)];
}
