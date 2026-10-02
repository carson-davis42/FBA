import { Link, useInRouterContext } from 'react-router-dom';

/** Where a player's profile lives. */
export const playerPath = (playerId: string): string => `/history/fba/players/${playerId}`;

/**
 * A player's name linked to his profile, wherever a name is shown (rosters, boards, game logs, awards). Without an id (a vacant or generated
 * slot, a name only the sheet knows) the name stays plain text. Don't use it inside an <option>, a <label> or an aria-label: those stay text.
 */
export function PlayerName({ id, name, className }: { id: string | null | undefined; name: string; className?: string }) {
  const inRouter = useInRouterContext();
  // Generated players have ids like "BRA:PG", not "p00001": no profile to open.
  if (!id || !inRouter || !/^p\d+$/.test(id)) return <>{name}</>;
  return <Link className={className} to={playerPath(id)} onClick={e => e.stopPropagation()}>{name}</Link>;
}
