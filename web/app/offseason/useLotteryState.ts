import { lotteryPath, type LotteryState } from '../../engine/offseason/lottery';
import type { CalendarFile, LotteryFile, MetaFile, PicksFile, PlayoffsFile, ResultsFile, TeamsFile, TransactionsFile } from '../../engine/shared/types';
import { useDoc, type DocState, type Versions } from '../api';

/**
 * Loads what the lottery needs for the current season. `versions` holds every doc `runLottery` writes;
 * a doc that doesn't exist yet has version null.
 */
export function useLotteryState(): { state?: LotteryState; versions: Versions; error?: Error } {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const at = (p: (n: number) => string) => (n === undefined ? null : p(n));
  const calendar = useDoc<CalendarFile>(n === undefined ? null : 'calendar.json');
  const teams = useDoc<TeamsFile>(n === undefined ? null : 'leagues/fba/teams.json');
  const results = useDoc<ResultsFile>(at(s => `leagues/fba/S${s}/results.json`));
  const picks = useDoc<PicksFile>(n === undefined ? null : 'leagues/fba/picks.json');
  const tx = useDoc<TransactionsFile>(at(s => `leagues/fba/S${s}/transactions.json`));
  const playoffs = useDoc<PlayoffsFile>(at(s => `leagues/fba/S${s}/playoffs.json`));
  const lottery = useDoc<LotteryFile>(at(lotteryPath));

  const versions: Versions = {};
  if (n !== undefined) {
    versions[lotteryPath(n)] = lottery.version;
    versions['leagues/fba/picks.json'] = picks.version;
    versions[`leagues/fba/S${n}/transactions.json`] = tx.version;
    versions['calendar.json'] = calendar.version;
  }

  const required: DocState<unknown>[] = [calendar, teams, results, picks, tx];
  const optional: DocState<unknown>[] = [playoffs, lottery];
  const error = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (n === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return { versions, error };
  return {
    versions,
    error,
    state: {
      season: n,
      calendar: calendar.data!,
      teams: teams.data!,
      results: results.data!,
      playoffs: playoffs.data ?? null,
      picks: picks.data!,
      tx: tx.data!,
      lottery: lottery.data ?? null,
    },
  };
}
