// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDoc } from './api';

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
