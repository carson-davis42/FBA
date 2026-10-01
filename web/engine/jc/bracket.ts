import type { Bracket, BracketGame, GameResult } from '../shared/types';

export type BracketKind = Bracket['kind'];
export type NewGame = Omit<BracketGame, 'result'>;

export function buildBracket(id: string, kind: BracketKind, name: string, games: NewGame[]): Bracket {
  return { id, kind, name, games: games.map(g => ({ ...g, result: null })), champion: null };
}

export const winnerOf = (g: BracketGame): string | null =>
  g.result ? (g.result.homePts > g.result.awayPts ? g.home : g.away) : null;

const isPlayable = (g: BracketGame): boolean => g.result === null && g.home !== null && g.away !== null;

/** The unplayed games with both teams known in the lowest round that has any. */
export function playableGames(b: Bracket): BracketGame[] {
  const open = b.games.filter(isPlayable);
  if (!open.length) return [];
  const round = Math.min(...open.map(g => g.round));
  return open.filter(g => g.round === round);
}

/** Stores a game's result, sends the winner (and his seed) to the next game, and sets the champion when the final is played. */
export function recordResult(b: Bracket, gameId: string, result: GameResult): Bracket {
  const game = b.games.find(g => g.id === gameId);
  if (!game) throw new Error(`${b.id} has no game ${gameId}`);
  if (game.result) throw new Error(`${b.id}/${gameId} is already played`);
  if (game.home === null || game.away === null) throw new Error(`${b.id}/${gameId} doesn't have both teams yet`);
  if (result.home !== game.home || result.away !== game.away) throw new Error(`${b.id}/${gameId}: the result's teams don't match the game`);
  if (result.homePts === result.awayPts) throw new Error(`${b.id}/${gameId} can't end tied`);
  const homeWon = result.homePts > result.awayPts;
  const winner = homeWon ? game.home : game.away;
  const seed = homeWon ? game.homeSeed : game.awaySeed;
  const games = b.games.map(g => {
    if (g.id === gameId) return { ...g, result };
    if (game.next && g.id === game.next.id) {
      return game.next.side === 'home' ? { ...g, home: winner, homeSeed: seed } : { ...g, away: winner, awaySeed: seed };
    }
    return g;
  });
  return { ...b, games, champion: game.next === null ? winner : b.champion };
}

const NAMES: Record<BracketKind, string[]> = {
  conf: ['First Round', 'Quarterfinals', 'Semifinals', 'Final'],
  mm: ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'],
  nit: ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'],
};

export const roundName = (kind: BracketKind, round: number): string => NAMES[kind][round - 1] ?? `Round ${round}`;

export const bracketResults = (b: Bracket | null): GameResult[] =>
  (b?.games ?? []).flatMap(g => (g.result ? [g.result] : []));
