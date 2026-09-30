import { Link } from 'react-router-dom';
import type { PlayersFile } from '../../engine/shared/types';

export function PlayerLink({ id, players }: { id: string | null; players: PlayersFile }) {
  if (id === null) return <>—</>;
  return <Link to={`/history/fba/players/${id}`}>{players.players[id]?.name ?? id}</Link>;
}

export function SkippedWarning({ errors }: { errors: { season: number; message: string }[] | undefined }) {
  if (!errors || errors.length === 0) return null;
  return <p className="warning">Some seasons couldn't be read: {errors.map(e => `S${e.season}`).join(', ')}</p>;
}
