import { useMemo } from 'react';
import { schoolIndex } from '../../../engine/history/schoolRoster';
import type { HallOfFameFile, PlayerBiosFile, PlayersFile, ResultsFile, RostersFile } from '../../../engine/shared/types';
import { PlayersPanel } from '../PlayersPanel';

export interface SchoolPlayersProps {
  team: { teamId: string; name: string };
  players: PlayersFile;
  bios: PlayerBiosFile | null;
  hof: HallOfFameFile | null;
  rosters: RostersFile[];
  /** The open season's games, which show who played for the school before a roster file does. */
  results?: ResultsFile | null;
  latest: number;
}

/** A school's players: everyone its bios, roster files and games place there, all-time or by season. */
export function SchoolPlayers({ team, players, bios, hof, rosters, results = null, latest }: SchoolPlayersProps) {
  const index = useMemo(() => schoolIndex({ team, players, bios, hof, rosters, results }), [team, players, bios, hof, rosters, results]);
  return <PlayersPanel index={index} seasons={index.seasons} players={players} latest={latest} />;
}
