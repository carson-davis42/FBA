import type { MetaFile, RostersFile } from '../../engine/shared/types';
import { docSettled, useDoc } from '../api';

/**
 * The World Cup rosters to show: this season's stage rosters if they exist, else last season's, else the
 * season named by `meta.rosterSeason.fbawc`. Settled once all three candidates are settled.
 */
export function useWcRosters(): { season?: number; rosters?: RostersFile | null; settled: boolean } {
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const cur = meta?.currentSeason;
  const path = (s: number | undefined) => (s === undefined ? null : `leagues/fbawc/S${s}/rosters.json`);
  const a = useDoc<RostersFile>(path(cur));
  const b = useDoc<RostersFile>(path(cur === undefined ? undefined : cur - 1));
  const c = useDoc<RostersFile>(path(meta?.rosterSeason.fbawc));
  if (!meta || cur === undefined) return { settled: false };
  if (a.data) return { season: cur, rosters: a.data, settled: docSettled(a) };
  if (!docSettled(a)) return { settled: false };
  if (b.data) return { season: cur - 1, rosters: b.data, settled: true };
  if (!docSettled(b)) return { settled: false };
  if (c.data) return { season: meta.rosterSeason.fbawc, rosters: c.data, settled: true };
  return { season: meta.rosterSeason.fbawc, rosters: docSettled(c) ? null : undefined, settled: docSettled(c) };
}
