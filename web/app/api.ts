import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new ApiError(res.status, body.error ?? res.statusText);
}

export async function getDoc<T>(rel: string): Promise<T> {
  return (await check(await fetch(`/api/state/${rel}`))).json() as Promise<T>;
}

export async function putDoc(rel: string, doc: unknown): Promise<void> {
  await check(await fetch(`/api/state/${rel}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) }));
  window.dispatchEvent(new CustomEvent('doc-saved', { detail: rel }));
}

export function useDoc<T>(rel: string | null): { data: T | undefined; error: Error | undefined; reload: () => void } {
  const [state, setState] = useState<{ rel?: string; data?: T; error?: Error }>({});
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!rel) return;
    const onSaved = (e: Event) => { if ((e as CustomEvent<string>).detail === rel) reload(); };
    window.addEventListener('doc-saved', onSaved);
    return () => window.removeEventListener('doc-saved', onSaved);
  }, [rel, reload]);

  useEffect(() => {
    if (!rel) return;
    let live = true;
    getDoc<T>(rel).then(
      data => live && setState({ rel, data }),
      error => live && setState({ rel, error: error as Error }),
    );
    return () => { live = false; };
  }, [rel, version]);

  const current = rel !== null && state.rel === rel ? state : {};
  return { data: current.data as T | undefined, error: current.error, reload };
}

export async function postBatch(label: string, writes: { path: string; doc: unknown }[]): Promise<string> {
  const res = await check(await fetch('/api/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, writes }) }));
  const body = (await res.json()) as { batchId: string };
  for (const w of writes) window.dispatchEvent(new CustomEvent('doc-saved', { detail: w.path }));
  window.dispatchEvent(new CustomEvent('batch-saved', { detail: label }));
  return body.batchId;
}

export async function undoLast(): Promise<string> {
  const res = await check(await fetch('/api/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  const body = (await res.json()) as { label: string; paths: string[] };
  for (const p of body.paths) window.dispatchEvent(new CustomEvent('doc-saved', { detail: p }));
  return body.label;
}

export async function peekUndo(): Promise<{ available: boolean; label: string | null }> {
  const res = await check(await fetch('/api/undo'));
  const body = (await res.json()) as { ok: boolean; available: boolean; label: string | null };
  return { available: body.available, label: body.label };
}
