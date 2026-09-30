// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, CONFLICT_MESSAGE, postBatch, putDoc, useDoc, useHistory, useSaving } from './api';
import { commitDocs } from './roster/commit';

describe('useDoc', () => {
  let resolveB: (value: { n: number }) => void;

  beforeEach(() => {
    const bPromise = new Promise<{ n: number }>(resolve => {
      resolveB = resolve;
    });

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/state/a.json') {
        return Promise.resolve(new Response(JSON.stringify({ n: 1 })));
      }
      if (url === '/api/state/b.json') {
        return bPromise.then(data => new Response(JSON.stringify(data)));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'nf' }), { status: 404 }));
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns data after a.json loads', async () => {
    const { result } = renderHook(() => useDoc('a.json'));
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
  });

  it('returns undefined when rel changes to b.json before it resolves', async () => {
    const { result, rerender } = renderHook(({ rel }: { rel: string }) => useDoc(rel), {
      initialProps: { rel: 'a.json' },
    });
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));

    rerender({ rel: 'b.json' });
    expect(result.current.data).toBeUndefined();
  });

  it('returns new data after b.json resolves', async () => {
    const { result, rerender } = renderHook(({ rel }: { rel: string }) => useDoc(rel), {
      initialProps: { rel: 'a.json' },
    });
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));

    rerender({ rel: 'b.json' });
    expect(result.current.data).toBeUndefined();

    resolveB({ n: 2 });
    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
  });

  it('returns undefined when rel changes to null', async () => {
    const { result, rerender } = renderHook(({ rel }: { rel: string | null }) => useDoc(rel as string | null), {
      initialProps: { rel: 'a.json' as string | null },
    });
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));

    rerender({ rel: null });
    expect(result.current.data).toBeUndefined();
  });
});

describe('versions and saving', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('exposes the ETag version and marks a 404 as missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/state/a.json'
      ? new Response(JSON.stringify({ n: 1 }), { headers: { ETag: '"00000000000000aa"' } })
      : new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))));
    const a = renderHook(() => useDoc('a.json'));
    await waitFor(() => expect(a.result.current.version).toBe('00000000000000aa'));
    const m = renderHook(() => useDoc('missing.json'));
    await waitFor(() => expect(m.result.current.missing).toBe(true));
    expect(m.result.current.version).toBeNull();
    expect(m.result.current.error).toBeTruthy();
  });

  it('sends If-Match on PUT and returns the new version', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, version: '00000000000000bb' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await putDoc('calendar.json', { x: 1 }, '00000000000000aa')).toBe('00000000000000bb');
    const first = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(first.headers).get('If-Match')).toBe('"00000000000000aa"');
    await putDoc('calendar.json', {}, null);
    const second = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(new Headers(second.headers).get('If-Match')).toBe('"null"');
  });

  it('sends baseVersion with batch writes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, batchId: '1', versions: { 'a.json': '00000000000000cc' } })));
    vi.stubGlobal('fetch', fetchMock);
    const r = await postBatch('X', [{ path: 'a.json', doc: {}, baseVersion: '00000000000000aa' }]);
    expect(r.versions['a.json']).toBe('00000000000000cc');
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.writes[0].baseVersion).toBe('00000000000000aa');
  });

  it('reloads conflicting docs and explains a 409', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'stale', conflicts: ['calendar.json'] }), { status: 409 })));
    const saved: string[] = [];
    const on = (e: Event) => saved.push((e as CustomEvent<string>).detail);
    window.addEventListener('doc-saved', on);
    const err = await postBatch('X', [{ path: 'calendar.json', doc: {}, baseVersion: null }]).catch((e: unknown) => e);
    window.removeEventListener('doc-saved', on);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(CONFLICT_MESSAGE);
    expect(saved).toEqual(['calendar.json']);
  });

  it('reports saving while a batch is in flight', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => {
      release = () => r(new Response(JSON.stringify({ ok: true, batchId: '1', versions: {} })));
    })));
    const { result } = renderHook(() => useSaving());
    expect(result.current).toBe(false);
    let p!: Promise<unknown>;
    act(() => { p = postBatch('X', [{ path: 'a.json', doc: {}, baseVersion: null }]); });
    await waitFor(() => expect(result.current).toBe(true));
    await act(async () => { release(); await p; });
    expect(result.current).toBe(false);
  });

  it('stays saving through the reload a batch write triggers for a doc this tab has open', async () => {
    let releaseReload!: () => void;
    const reloadPending = new Promise<Response>(r => { releaseReload = () => r(new Response(JSON.stringify({ n: 2 }))); });
    let firstLoadDone = false;
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/state/a.json') {
        if (!firstLoadDone) {
          firstLoadDone = true;
          return Promise.resolve(new Response(JSON.stringify({ n: 1 })));
        }
        return reloadPending;
      }
      if (url === '/api/batch') {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, batchId: '1', versions: {} })));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => ({ doc: useDoc('a.json'), saving: useSaving() }));
    await waitFor(() => expect(result.current.doc.data).toEqual({ n: 1 }));
    expect(result.current.saving).toBe(false);

    let p!: Promise<unknown>;
    await act(async () => {
      p = postBatch('X', [{ path: 'a.json', doc: {}, baseVersion: null }]);
      await p;
    });
    // The POST resolved, but the reload it triggered for a.json (still open in this tab) hasn't settled yet.
    expect(result.current.saving).toBe(true);

    await act(async () => { releaseReload(); await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.saving).toBe(false);
    expect(result.current.doc.data).toEqual({ n: 2 });
  });

  it('reloads a doc when another tab reports it saved', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ n: 1 })));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useDoc('a.json'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const other = new BroadcastChannel('fba-docs');
    other.postMessage({ paths: ['a.json'] });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    other.close();
  });

  it('tells other tabs what it saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, batchId: '1', versions: {} }))));
    const other = new BroadcastChannel('fba-docs');
    const got = new Promise<unknown>(r => other.addEventListener('message', e => r((e as MessageEvent).data), { once: true }));
    await postBatch('X', [{ path: 'a.json', doc: {}, baseVersion: null }]);
    expect(await got).toEqual({ paths: ['a.json'] });
    other.close();
  });
});

describe('resetUndo passthrough and history', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('sends resetUndo only when asked, through postBatch and commitDocs', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init!.body)));
      return new Response(JSON.stringify({ ok: true, batchId: '1', versions: {} }));
    }));
    const writes = [{ path: 'calendar.json', doc: {}, baseVersion: null }];
    await postBatch('A', writes);
    await postBatch('B', writes, { resetUndo: true });
    await commitDocs('C', [{ path: 'calendar.json', doc: {} }], { 'calendar.json': null }, { resetUndo: true });
    expect(bodies).toEqual([{ label: 'A', writes }, { label: 'B', writes, resetUndo: true }, { label: 'C', writes, resetUndo: true }]);
  });

  it('loads a league history', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/history/fba'
      ? new Response(JSON.stringify({ league: 'fba', seasons: [{ season: 78 }], errors: [{ season: 5, message: 'bad JSON' }] }))
      : new Response('{}', { status: 404 }))));
    const { result } = renderHook(() => useHistory('fba'));
    await waitFor(() => expect(result.current.seasons).toEqual([{ season: 78 }]));
    expect(result.current.errors).toEqual([{ season: 5, message: 'bad JSON' }]);
  });
});
