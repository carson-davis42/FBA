import { seasonPhase, type SeasonPhase } from '../../engine/season/locks';
import type { FreeAgentsFile, MetaFile, ResultsFile, ScheduleFile } from '../../engine/shared/types';
import { useDoc } from '../api';

/** The current roster-lock phase, or undefined while its docs load. */
export function useSeasonPhase(): SeasonPhase | undefined {
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const s = meta?.currentSeason;
  const fa = useDoc<FreeAgentsFile>(s === undefined ? null : `leagues/fba/S${s}/freeAgents.json`);
  const sched = useDoc<ScheduleFile>(s === undefined ? null : `leagues/fba/S${s}/schedule.json`);
  const res = useDoc<ResultsFile>(s === undefined ? null : `leagues/fba/S${s}/results.json`);
  if (s === undefined || [fa, sched, res].some(d => !d.data && !d.error)) return undefined;
  return seasonPhase({
    freeAgencyClosed: fa.data?.locked ?? false,
    fbaGamesPlayed: res.data?.games.length ?? 0,
    deadlineDone: sched.data?.pauses.some(p => p.kind === 'deadline' && p.done) ?? false,
  });
}
