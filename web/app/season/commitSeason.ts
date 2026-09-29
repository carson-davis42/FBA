import { seasonWrites, type SeasonResult } from '../../engine/season/state';
import type { Versions } from '../api';
import { commitDocs } from '../roster/commit';

export function commitSeason(result: Extract<SeasonResult, { ok: true }>, versions: Versions, options: { resetUndo?: boolean } = {}): Promise<Record<string, string>> {
  return commitDocs(result.label, seasonWrites(result), versions, options);
}
