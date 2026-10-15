import { useMemo } from 'react';
import { franchiseIndex, franchiseSeasons } from '../../engine/history/franchiseRoster';
import type { Franchise, HallOfFameFile, PlayerBiosFile, PlayersFile, ResultsFile, RostersFile, SummaryFile } from '../../engine/shared/types';
import { PlayersPanel } from './PlayersPanel';

export interface FranchisePlayersProps {
  franchise: Franchise;
  players: PlayersFile;
  bios: PlayerBiosFile | null;
  summaries: SummaryFile[];
  hof: HallOfFameFile | null;
  rosters: RostersFile[];
  /** The season being played: its games show who played for the franchise before any summary exists. */
  results?: ResultsFile | null;
  latest: number;
}

/** The franchise's players, from its bios, roster files and summaries. */
export function FranchisePlayers({ franchise, players, bios, summaries, hof, rosters, results = null, latest }: FranchisePlayersProps) {
  const index = useMemo(() => franchiseIndex({ franchise, players, bios, summaries, hof, rosters, results }), [franchise, players, bios, summaries, hof, rosters, results]);
  const seasons = useMemo(() => franchiseSeasons(franchise, latest), [franchise, latest]);

  return <PlayersPanel index={index} seasons={seasons} players={players} latest={latest} />;
}
