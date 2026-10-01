import { mulberry32 } from '../../engine/d2/random';
import type { CalendarFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { useJcDocs, type JcDocs } from './useJcDocs';
import { useJcRun } from './useJcRun';

export const newRng = () => mulberry32(Math.floor(Math.random() * 2 ** 32));

/** The current season's docs plus the move runner every postseason page uses. */
export function usePostseasonDocs(): { season: number | null; docs: JcDocs; saving: boolean; error: string; run: ReturnType<typeof useJcRun>['run'] } {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const { saving, error, run } = useJcRun(docs.versions, docs.reload);
  return { season, docs, saving, error, run };
}
