import { useMemo } from 'react';
import { proPlayerIds } from '../../engine/college/setup';
import { boardPath, emptyRecruiting, recruitingDocPath, type RecruitingDocKey, type RecruitingState } from '../../engine/college/state';
import type {
  CalendarFile, FreeAgentsFile, MetaFile, PlayersFile, RecruitingFile, ReservesFile, RostersFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, type DocState, type Versions } from '../api';

/** What the one-time college setup needs. */
export interface CollegeSetupInput {
  meta: MetaFile;
  /** Last season's college rosters; null if missing. */
  prev: RostersFile | null;
  proIds: Set<string>;
}

/**
 * Loads the recruiting board at S{boardSeason} (the class of boardSeason + 1) with the calendar season n's rosters, tx and calendar:
 * `state` once the season's college rosters exist, otherwise `setup` for the one-time setup panel.
 * `versions` holds every doc either of them may write.
 */
export function useRecruitingState(boardSeason: number | undefined): { season?: number; state?: RecruitingState; setup?: CollegeSetupInput; versions: Versions; error?: Error } {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const at = (k: RecruitingDocKey) => (n === undefined ? null : recruitingDocPath(k, n));
  const recruiting = useDoc<RecruitingFile>(n === undefined || boardSeason === undefined ? null : boardPath(boardSeason));
  const rosters = useDoc<RostersFile>(at('rosters'));
  const tx = useDoc<TransactionsFile>(at('tx'));
  const players = useDoc<PlayersFile>(at('players'));
  const calendar = useDoc<CalendarFile>(at('calendar'));
  const teams = useDoc<TeamsFile>(n === undefined ? null : 'leagues/fbajc/teams.json');
  const prev = useDoc<RostersFile>(n === undefined ? null : `leagues/fbajc/S${n - 1}/rosters.json`);
  const fba = useDoc<RostersFile>(n === undefined ? null : `leagues/fba/S${n}/rosters.json`);
  const freeAgents = useDoc<FreeAgentsFile>(n === undefined ? null : `leagues/fba/S${n}/freeAgents.json`);
  const d2 = useDoc<RostersFile>(n === undefined ? null : `leagues/fbad2/S${n}/rosters.json`);
  const reserves = useDoc<ReservesFile>(n === undefined ? null : `leagues/fbad2/S${n}/reserves.json`);
  // Stable stand-ins for docs that don't exist yet: useAutosaveDoc resyncs whenever its data changes identity.
  const emptyBoard = useMemo(() => (boardSeason === undefined ? undefined : emptyRecruiting(boardSeason)), [boardSeason]);
  const emptyTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fbajc', season: n, entries: [] }), [n]);
  const proIds = useMemo(
    () => (fba.data && d2.data ? proPlayerIds({ fba: fba.data, freeAgents: freeAgents.data ?? null, d2: d2.data, reserves: reserves.data ?? null }) : new Set<string>()),
    [fba.data, freeAgents.data, d2.data, reserves.data],
  );

  const versions: Versions = {};
  if (n !== undefined) {
    const writable: [RecruitingDocKey, DocState<unknown>][] = [
      ['rosters', rosters], ['tx', tx], ['players', players], ['calendar', calendar],
    ];
    for (const [k, d] of writable) versions[recruitingDocPath(k, n)] = d.version;
    if (boardSeason !== undefined) versions[boardPath(boardSeason)] = recruiting.version;
    versions['meta.json'] = meta.version;
  }

  const required: DocState<unknown>[] = [players, calendar, teams, fba, d2];
  const optional: DocState<unknown>[] = [recruiting, rosters, tx, prev, freeAgents, reserves];
  const error = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (n === undefined || boardSeason === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return { season: n, versions, error };
  if (!rosters.data) return { season: n, versions, error, setup: { meta: meta.data!, prev: prev.data ?? null, proIds } };
  return {
    season: n,
    versions,
    error,
    state: {
      season: n,
      recruiting: recruiting.data ?? emptyBoard!,
      rosters: rosters.data,
      teams: teams.data!,
      players: players.data!,
      tx: tx.data ?? emptyTx!,
      calendar: calendar.data!,
    },
  };
}
