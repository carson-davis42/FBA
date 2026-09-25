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
