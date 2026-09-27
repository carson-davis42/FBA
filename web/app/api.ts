import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type Version = string | null;
/** Loaded document versions, keyed by data path (e.g. `calendar.json`). */
export type Versions = Record<string, Version>;

export const CONFLICT_MESSAGE = 'This data changed in another tab or window. It has been reloaded; check it and try again.';

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly conflicts: string[] = []) {
    super(message);
  }
}

// ---- saving flag ----

let inFlight = 0;
const savingListeners = new Set<() => void>();

function changeInFlight(delta: number): void {
  inFlight += delta;
  for (const l of savingListeners) l();
}

async function tracked<T>(work: () => Promise<T>): Promise<T> {
  changeInFlight(1);
  try {
    return await work();
  } finally {
    changeInFlight(-1);
  }
}

/**
 * True while any save or undo started by this tab is in flight, and while any `useDoc` reload
 * that a save's `doc-saved` notification triggered (in this tab or another) hasn't settled yet.
 * This keeps the flag true across the handoff from a save's POST to the reload it kicks off, so a
 * second action can't run against not-yet-refreshed local state and report a misleading conflict.
 */
export function useSaving(): boolean {
  return useSyncExternalStore(
    cb => {
      savingListeners.add(cb);
      return () => { savingListeners.delete(cb); };
    },
    () => inFlight > 0,
  );
}

// ---- change notification (this tab and other tabs) ----

const channel: BroadcastChannel | null = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('fba-docs');
(channel as unknown as { unref?: () => void } | null)?.unref?.();

function dispatchSaved(paths: string[]): void {
  for (const p of paths) window.dispatchEvent(new CustomEvent('doc-saved', { detail: p }));
}

channel?.addEventListener('message', e => {
  const paths = (e as MessageEvent<{ paths?: unknown }>).data?.paths;
  if (Array.isArray(paths)) dispatchSaved(paths.filter((p): p is string => typeof p === 'string'));
});

/** Tells this tab and every other open tab that these documents changed. */
export function notifySaved(paths: string[]): void {
  dispatchSaved(paths);
  channel?.postMessage({ paths });
}

// ---- requests ----

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { error?: string; conflicts?: string[] };
  if (res.status === 409 && body.conflicts?.length) {
    dispatchSaved(body.conflicts);
    throw new ApiError(409, CONFLICT_MESSAGE, body.conflicts);
  }
  throw new ApiError(res.status, body.error ?? res.statusText);
}

const tagOf = (res: Response): Version => res.headers.get('ETag')?.replace(/^"|"$/g, '') ?? null;

export async function getDoc<T>(rel: string): Promise<T> {
  return (await check(await fetch(`/api/state/${rel}`))).json() as Promise<T>;
}

type Loaded<T> = { data: T; version: Version } | { missing: true };

async function loadDoc<T>(rel: string): Promise<Loaded<T>> {
  const res = await fetch(`/api/state/${rel}`);
  if (res.status === 404) return { missing: true };
  await check(res);
  return { data: (await res.json()) as T, version: tagOf(res) };
}

export interface DocState<T> {
  data: T | undefined;
  version: Version;
  missing: boolean;
  error: Error | undefined;
  reload: () => void;
}

export function useDoc<T>(rel: string | null): DocState<T> {
  const [state, setState] = useState<{ rel?: string; data?: T; version?: Version; missing?: boolean; error?: Error }>({});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(v => v + 1), []);

  useEffect(() => {
    if (!rel) return;
    const onSaved = (e: Event) => { if ((e as CustomEvent<string>).detail === rel) reload(); };
    window.addEventListener('doc-saved', onSaved);
    return () => window.removeEventListener('doc-saved', onSaved);
  }, [rel, reload]);

  useEffect(() => {
    if (!rel) return;
    let live = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      changeInFlight(-1);
    };
    changeInFlight(1);
    loadDoc<T>(rel).then(
      r => {
        if (!live) return;
        if ('missing' in r) setState({ rel, missing: true, version: null, error: new ApiError(404, `Not found: ${rel}`) });
        else setState({ rel, data: r.data, version: r.version });
      },
      error => live && setState({ rel, error: error as Error }),
    ).finally(finish);
    return () => {
      live = false;
      finish();
    };
  }, [rel, tick]);

  const current = rel !== null && state.rel === rel ? state : {};
  return { data: current.data, version: current.version ?? null, missing: current.missing ?? false, error: current.error, reload };
}

export function putDoc(rel: string, doc: unknown, baseVersion: Version): Promise<Version> {
  return tracked(async () => {
    const res = await check(await fetch(`/api/state/${rel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"${baseVersion ?? 'null'}"` },
      body: JSON.stringify(doc),
    }));
    const body = (await res.json()) as { version?: string };
    notifySaved([rel]);
    return body.version ?? null;
  });
}

export interface VersionedWrite {
  path: string;
  doc: unknown;
  baseVersion: Version;
}

export function postBatch(label: string, writes: VersionedWrite[]): Promise<{ batchId: string; versions: Record<string, string> }> {
  return tracked(async () => {
    const res = await check(await fetch('/api/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, writes }),
    }));
    const body = (await res.json()) as { batchId: string; versions?: Record<string, string> };
    notifySaved(writes.map(w => w.path));
    return { batchId: body.batchId, versions: body.versions ?? {} };
  });
}

export function undoLast(): Promise<string> {
  return tracked(async () => {
    const res = await check(await fetch('/api/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    const body = (await res.json()) as { label: string; paths: string[] };
    notifySaved(body.paths);
    return body.label;
  });
}

export async function peekUndo(): Promise<{ available: boolean; label: string | null }> {
  const res = await check(await fetch('/api/undo'));
  const body = (await res.json()) as { ok: boolean; available: boolean; label: string | null };
  return { available: body.available, label: body.label };
}
