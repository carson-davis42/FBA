import { docPath, type MoveResult } from '../../engine/roster/state';
import { postBatch } from '../api';

export function newBatchId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export async function commitMove(result: Extract<MoveResult, { ok: true }>, extra: { path: string; doc: unknown }[] = []): Promise<void> {
  const writes = result.changed.map(k => ({ path: docPath(k, result.state.season), doc: result.state[k] }));
  await postBatch(result.label, [...writes, ...extra]);
}
