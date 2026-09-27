import { d2DocPath, type D2DocKey, type D2State } from '../../engine/d2/state';
import type {
  CalendarFile, D2DraftFile, D2PoolFile, D2RatingsFile, FreeAgentsFile, MetaFile, PlayersFile, ReservesFile, RostersFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, type DocState, type Versions } from '../api';

/** Loads everything the D2 ratings, pool, and draft screens need, plus the version of every doc they may write. */
export function useD2State(): { state?: D2State; versions: Versions; error?: Error } {
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason;
  const at = (k: D2DocKey) => (season === undefined ? null : d2DocPath(k, season));
  const d2 = useDoc<RostersFile>(at('d2'));
  const reserves = useDoc<ReservesFile>(at('reserves'));
  const d2Tx = useDoc<TransactionsFile>(at('d2Tx'));
  const calendar = useDoc<CalendarFile>(at('calendar'));
  const ratings = useDoc<D2RatingsFile>(at('ratings'));
  const pool = useDoc<D2PoolFile>(at('pool'));
  const draft = useDoc<D2DraftFile>(at('draft'));
  const players = useDoc<PlayersFile>(season === undefined ? null : 'players.json');
  const prevD2 = useDoc<RostersFile>(season === undefined ? null : `leagues/fbad2/S${season - 1}/rosters.json`);
  const freeAgents = useDoc<FreeAgentsFile>(season === undefined ? null : `leagues/fba/S${season}/freeAgents.json`);

  const versions: Versions = {};
  if (season !== undefined) {
    const writable: [D2DocKey, DocState<unknown>][] = [
      ['d2', d2], ['reserves', reserves], ['d2Tx', d2Tx], ['calendar', calendar], ['ratings', ratings], ['pool', pool], ['draft', draft],
    ];
    for (const [k, d] of writable) versions[d2DocPath(k, season)] = d.version;
  }

  const required: DocState<unknown>[] = [d2, reserves, d2Tx, calendar, players];
  const optional: DocState<unknown>[] = [ratings, pool, draft, prevD2, freeAgents];
  const error = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (season === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return { versions, error };
  return {
    versions,
    state: {
      season,
      d2: d2.data!,
      reserves: reserves.data!,
      d2Tx: d2Tx.data!,
      players: players.data!,
      calendar: calendar.data!,
      prevD2: prevD2.data ?? null,
      freeAgencyClosed: freeAgents.data?.locked ?? false,
      ratings: ratings.data ?? null,
      pool: pool.data ?? null,
      draft: draft.data ?? null,
    },
  };
}
