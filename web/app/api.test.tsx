// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, CONFLICT_MESSAGE, postBatch, putDoc, useDoc, useSaving } from './api';

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
