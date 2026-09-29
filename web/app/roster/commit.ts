import { docPath, type MoveResult } from '../../engine/roster/state';
import { postBatch, type Versions } from '../api';

export function newBatchId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Saves documents as one batch. Each write carries the version this page loaded, so a stale page can't overwrite newer data. */
export async function commitDocs(
  label: string,
  docs: { path: string; doc: unknown }[],
  versions: Versions,
  options: { resetUndo?: boolean } = {},
): Promise<Record<string, string>> {
  const writes = docs.map(d => {
    if (!(d.path in versions)) throw new Error(`No loaded version for ${d.path}; reload the page`);
    return { path: d.path, doc: d.doc, baseVersion: versions[d.path] };
  });
  return (await postBatch(label, writes, options)).versions;
}

export async function commitMove(result: Extract<MoveResult, { ok: true }>, versions: Versions, extra: { path: string; doc: unknown }[] = []): Promise<Record<string, string>> {
  const writes = result.changed.map(k => ({ path: docPath(k, result.state.season), doc: result.state[k] }));
  return commitDocs(result.label, [...writes, ...extra], versions);
}
